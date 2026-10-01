package com.childsafelens.demo.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.asLiveData
import androidx.lifecycle.viewModelScope
import com.childsafelens.demo.EventLogger
import com.childsafelens.demo.IncidentManager
import com.childsafelens.demo.Inference
import com.childsafelens.demo.Masker
import com.childsafelens.demo.RiskPolicyManager
import com.childsafelens.demo.data.db.AppDatabase
import com.childsafelens.demo.data.model.ChildProfile
import com.childsafelens.demo.data.model.Message
import com.childsafelens.demo.data.model.NudgeEventEntity
import com.childsafelens.demo.data.model.ParentAccount
import com.childsafelens.demo.data.model.RiskLevel
import com.childsafelens.demo.data.model.Sender
import com.childsafelens.demo.security.PasswordHasher
import com.childsafelens.demo.security.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

class AuthViewModel(application: Application) : AndroidViewModel(application) {
    private val db = AppDatabase.getDatabase(application)
    private val parentDao = db.parentAccountDao()
    private val childDao = db.childProfileDao()
    val sessionManager = SessionManager(application)

    fun checkSession(onResult: (isLoggedIn: Boolean, hasChild: Boolean) -> Unit) {
        val email = sessionManager.getParentEmail()
        if (email != null) {
            viewModelScope.launch {
                val profiles = withContext(Dispatchers.IO) {
                    childDao.getChildProfilesForParent(email)
                }
                val hasChild = profiles.isNotEmpty()
                if (hasChild && sessionManager.getActiveChildProfile() == null) {
                    sessionManager.setActiveChildProfile(profiles.first().displayName)
                }
                onResult(true, hasChild)
            }
        } else {
            onResult(false, false)
        }
    }

    fun login(email: String, password: String, onResult: (success: Boolean, error: String?) -> Unit) {
        if (email.isBlank() || password.isBlank()) {
            onResult(false, "Fields cannot be empty")
            return
        }
        viewModelScope.launch {
            val account = withContext(Dispatchers.IO) {
                parentDao.getParentAccount(email)
            }
            if (account == null) {
                onResult(false, "Account not found")
                return@launch
            }
            val hashed = PasswordHasher.hashPassword(password, account.salt)
            if (hashed == account.passwordHash) {
                sessionManager.loginParent(email)
                val profiles = withContext(Dispatchers.IO) {
                    childDao.getChildProfilesForParent(email)
                }
                if (profiles.isNotEmpty()) {
                    sessionManager.setActiveChildProfile(profiles.first().displayName)
                }
                onResult(true, null)
            } else {
                onResult(false, "Invalid password")
            }
        }
    }

    fun signup(email: String, password: String, onResult: (success: Boolean, error: String?) -> Unit) {
        if (email.isBlank() || password.isBlank()) {
            onResult(false, "Fields cannot be empty")
            return
        }
        viewModelScope.launch {
            val existing = withContext(Dispatchers.IO) {
                parentDao.getParentAccount(email)
            }
            if (existing != null) {
                onResult(false, "Account already exists")
                return@launch
            }
            val salt = PasswordHasher.generateSalt()
            val passwordHash = PasswordHasher.hashPassword(password, salt)
            val account = ParentAccount(email, passwordHash, salt)
            withContext(Dispatchers.IO) {
                parentDao.insert(account)
            }
            sessionManager.loginParent(email)
            onResult(true, null)
        }
    }

    fun addChildProfile(displayName: String, onResult: (success: Boolean, error: String?) -> Unit) {
        val email = sessionManager.getParentEmail()
        if (email == null) {
            onResult(false, "No active parent session")
            return
        }
        if (displayName.isBlank()) {
            onResult(false, "Display name cannot be empty")
            return
        }
        viewModelScope.launch {
            val childProfile = ChildProfile(parentEmail = email, displayName = displayName)
            withContext(Dispatchers.IO) {
                childDao.insert(childProfile)
            }
            sessionManager.setActiveChildProfile(displayName)
            onResult(true, null)
        }
    }

    fun verifyPassword(password: String, onResult: (success: Boolean) -> Unit) {
        val email = sessionManager.getParentEmail()
        if (email == null) {
            onResult(false)
            return
        }
        viewModelScope.launch {
            val account = withContext(Dispatchers.IO) {
                parentDao.getParentAccount(email)
            }
            if (account == null) {
                onResult(false)
                return@launch
            }
            val hashed = PasswordHasher.hashPassword(password, account.salt)
            onResult(hashed == account.passwordHash)
        }
    }
}

class ChatViewModel(application: Application) : AndroidViewModel(application) {

    private val _messages = MutableLiveData<List<Message>>(emptyList())
    val messages: LiveData<List<Message>> = _messages

    private val _pendingApprovalState = MutableLiveData<Boolean>(false)
    val pendingApprovalState: LiveData<Boolean> = _pendingApprovalState

    fun sendMessage(text: String) {
        if (text.isBlank()) return

        val score = Inference.scoreText(text)
        val policy = RiskPolicyManager.evaluate(score)
        val filteredText = applySafeSendFilter(text)
        val incidentId = "INC_${UUID.randomUUID().hashCode().toUInt().toString(16)}"

        if (policy.requiresParentApproval) {
            _pendingApprovalState.value = true
        }

        val riskLevel = if (score > 0.8f) RiskLevel.HIGH else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE
        val displayStr = if (policy.requiresParentApproval) "$text ⏳ (Pending Parent Review)" else filteredText

        val msg = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = Sender.CHILD,
            timestamp = System.currentTimeMillis(),
            riskLevel = riskLevel,
            displayText = displayStr,
            isRevealed = true
        )
        addMessage(msg)

        IncidentManager.createAndSendIncident(
            incidentId = incidentId,
            type = "OUTGOING",
            message = text,
            riskScore = score,
            riskLevel = policy.riskLevel,
            category = if (policy.riskLevel == RiskPolicyManager.RiskLevel.LOW) "safe" else "potential_cyberbullying",
            packageName = "com.childsafelens.demo",
            status = if (policy.requiresParentApproval) "PENDING" else "ALLOWED",
            onDecisionReceived = { decision, _ ->
                _pendingApprovalState.postValue(false)
                if (decision.uppercase() in listOf("ALLOW", "SHOW")) {
                    // Update message display text to filtered text upon approval
                    viewModelScope.launch(Dispatchers.Main) {
                        updateMessageDisplay(msg.id, filteredText)
                    }
                }
            }
        )
    }

    fun injectPresetMessage(text: String) {
        val score = Inference.scoreText(text)
        val policy = RiskPolicyManager.evaluate(score)
        val filteredText = applySafeSendFilter(text)
        val incidentId = "INC_${UUID.randomUUID().hashCode().toUInt().toString(16)}"
        
        if (policy.requiresParentApproval) {
            _pendingApprovalState.value = true
        }

        val riskLevel = if (score > 0.8f) RiskLevel.HIGH else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE
        val displayStr = if (policy.requiresParentApproval) "$text ⏳ (Pending Parent Review)" else filteredText

        val msg = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = Sender.SIMULATED_CONTACT,
            timestamp = System.currentTimeMillis(),
            riskLevel = riskLevel,
            displayText = displayStr,
            isRevealed = true
        )
        addMessage(msg)

        IncidentManager.createAndSendIncident(
            incidentId = incidentId,
            type = "INCOMING",
            message = text,
            riskScore = score,
            riskLevel = policy.riskLevel,
            category = if (policy.riskLevel == RiskPolicyManager.RiskLevel.LOW) "safe" else "potential_cyberbullying",
            packageName = "com.childsafelens.demo",
            status = if (policy.requiresParentApproval) "PENDING" else "ALLOWED",
            onDecisionReceived = { decision, _ ->
                _pendingApprovalState.postValue(false)
                if (decision.uppercase() in listOf("ALLOW", "SHOW")) {
                    viewModelScope.launch(Dispatchers.Main) {
                        updateMessageDisplay(msg.id, filteredText)
                    }
                }
            }
        )
    }

    fun revealMessage(messageId: String) {
        val currentList = _messages.value.orEmpty()
        val updated = currentList.map {
            if (it.id == messageId) {
                it.copy().apply { isRevealed = true }
            } else {
                it
            }
        }
        _messages.value = updated
    }

    private fun updateMessageDisplay(messageId: String, newText: String) {
        val currentList = _messages.value.orEmpty()
        val updated = currentList.map {
            if (it.id == messageId) {
                it.copy(displayText = newText)
            } else {
                it
            }
        }
        _messages.value = updated
    }

    fun ignoreMessage(messageId: String) {}

    private fun addMessage(message: Message) {
        val currentList = _messages.value.orEmpty()
        _messages.value = currentList + message
    }

    private fun applySafeSendFilter(text: String): String {
        Masker.ensureInitialized(getApplication())
        return Masker.mask(text)
    }
}

class DashboardViewModel(application: Application) : AndroidViewModel(application) {
    private val db = AppDatabase.getDatabase(application)
    private val nudgeEventDao = db.nudgeEventDao()

    val nudgeEvents: LiveData<List<NudgeEventEntity>> = nudgeEventDao.getAllEventsFlow().asLiveData()
}

class SimulatorViewModel(application: Application) : AndroidViewModel(application) {
    private val _messages = MutableLiveData<List<Message>>(emptyList())
    val messages: LiveData<List<Message>> = _messages

    private val _pendingApprovalState = MutableLiveData<Boolean>(false)
    val pendingApprovalState: LiveData<Boolean> = _pendingApprovalState

    fun sendMessageAsChild(text: String) {
        if (text.isBlank()) return
        val score = Inference.scoreText(text)
        val policy = RiskPolicyManager.evaluate(score)
        val filteredText = applySafeSendFilter(text)
        val incidentId = "INC_${UUID.randomUUID().hashCode().toUInt().toString(16)}"

        if (policy.requiresParentApproval) {
            _pendingApprovalState.value = true
        }

        val riskLevel = if (score > 0.8f) RiskLevel.HIGH else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE
        val displayStr = if (policy.requiresParentApproval) "$text ⏳ (Pending Parent Review)" else filteredText

        val msg = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = Sender.CHILD,
            timestamp = System.currentTimeMillis(),
            riskLevel = riskLevel,
            displayText = displayStr,
            isRevealed = true
        )
        addMessage(msg)

        IncidentManager.createAndSendIncident(
            incidentId = incidentId,
            type = "OUTGOING",
            message = text,
            riskScore = score,
            riskLevel = policy.riskLevel,
            category = if (policy.riskLevel == RiskPolicyManager.RiskLevel.LOW) "safe" else "potential_cyberbullying",
            packageName = "com.childsafelens.demo",
            status = if (policy.requiresParentApproval) "PENDING" else "ALLOWED",
            onDecisionReceived = { decision, _ ->
                _pendingApprovalState.postValue(false)
                if (decision.uppercase() in listOf("ALLOW", "SHOW")) {
                    viewModelScope.launch(Dispatchers.Main) {
                        updateMessageDisplay(msg.id, filteredText)
                    }
                }
            }
        )
    }

    fun sendMessageAsContact(text: String) {
        if (text.isBlank()) return
        val score = Inference.scoreText(text)
        val policy = RiskPolicyManager.evaluate(score)
        val filteredText = applySafeSendFilter(text)
        val incidentId = "INC_${UUID.randomUUID().hashCode().toUInt().toString(16)}"

        if (policy.requiresParentApproval) {
            _pendingApprovalState.value = true
        }

        val riskLevel = if (score > 0.8f) RiskLevel.HIGH else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE
        val displayStr = if (policy.requiresParentApproval) "$text ⏳ (Pending Parent Review)" else filteredText

        val msg = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = Sender.SIMULATED_CONTACT,
            timestamp = System.currentTimeMillis(),
            riskLevel = riskLevel,
            displayText = displayStr,
            isRevealed = true
        )
        addMessage(msg)

        IncidentManager.createAndSendIncident(
            incidentId = incidentId,
            type = "INCOMING",
            message = text,
            riskScore = score,
            riskLevel = policy.riskLevel,
            category = if (policy.riskLevel == RiskPolicyManager.RiskLevel.LOW) "safe" else "potential_cyberbullying",
            packageName = "com.childsafelens.demo",
            status = if (policy.requiresParentApproval) "PENDING" else "ALLOWED",
            onDecisionReceived = { decision, _ ->
                _pendingApprovalState.postValue(false)
                if (decision.uppercase() in listOf("ALLOW", "SHOW")) {
                    viewModelScope.launch(Dispatchers.Main) {
                        updateMessageDisplay(msg.id, filteredText)
                    }
                }
            }
        )
    }

    fun revealMessage(messageId: String) {
        val currentList = _messages.value.orEmpty()
        val updated = currentList.map {
            if (it.id == messageId) {
                it.copy().apply { isRevealed = true }
            } else {
                it
            }
        }
        _messages.value = updated
    }

    private fun updateMessageDisplay(messageId: String, newText: String) {
        val currentList = _messages.value.orEmpty()
        val updated = currentList.map {
            if (it.id == messageId) {
                it.copy(displayText = newText)
            } else {
                it
            }
        }
        _messages.value = updated
    }

    fun ignoreMessage(messageId: String) {}

    private fun addMessage(message: Message) {
        val current = _messages.value.orEmpty()
        _messages.value = current + message
    }

    private fun applySafeSendFilter(text: String): String {
        Masker.ensureInitialized(getApplication())
        return Masker.mask(text)
    }
}
