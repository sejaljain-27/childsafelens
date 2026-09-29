package com.childsafelens.demo.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.asLiveData
import androidx.lifecycle.viewModelScope
import com.childsafelens.demo.EventLogger
import com.childsafelens.demo.Inference
import com.childsafelens.demo.Masker
import com.childsafelens.demo.NudgeAccessibilityService
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

    private val _pendingOutgoingMessage = MutableLiveData<Message?>(null)
    val pendingOutgoingMessage: LiveData<Message?> = _pendingOutgoingMessage

    private val flaggedTerms = listOf("stupid", "idiot", "hate you", "ugly", "loser", "dumb", "shut up")

    fun sendMessage(text: String) {
        if (text.isBlank()) return

        val score = Inference.scoreText(text)
        val riskLevel = if (score > 0.8f) RiskLevel.HIGH else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE

        val msg = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = Sender.CHILD,
            timestamp = System.currentTimeMillis(),
            riskLevel = riskLevel,
            displayText = text,
            isRevealed = true
        )

        if (riskLevel == RiskLevel.SAFE) {
            addMessage(msg)
        } else {
            _pendingOutgoingMessage.value = msg
        }
    }

    fun confirmSendAnyway() {
        val msg = _pendingOutgoingMessage.value ?: return
        _pendingOutgoingMessage.value = null

        val filteredText = applySafeSendFilter(msg.text)
        msg.displayText = filteredText

        addMessage(msg)

        val score = if (msg.riskLevel == RiskLevel.HIGH) 0.9f else 0.6f
        viewModelScope.launch(Dispatchers.IO) {
            EventLogger.logNudgeEvent(
                riskLevel = score,
                timestamp = msg.timestamp,
                direction = "OUTGOING",
                messageId = msg.id
            )
        }

        triggerParentAlert()
    }

    fun cancelPendingMessage() {
        _pendingOutgoingMessage.value = null
    }

    fun injectPresetMessage(text: String) {
        val score = Inference.scoreText(text)
        val riskLevel = if (score > 0.8f) RiskLevel.HIGH else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE

        // Apply masking to the display text if it's risky
        val filteredText = if (riskLevel != RiskLevel.SAFE) applySafeSendFilter(text) else text
        
        val msg = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = Sender.SIMULATED_CONTACT,
            timestamp = System.currentTimeMillis(),
            riskLevel = riskLevel,
            displayText = filteredText,
            isRevealed = (riskLevel == RiskLevel.SAFE)
        )

        addMessage(msg)

        if (riskLevel != RiskLevel.SAFE) {
            viewModelScope.launch(Dispatchers.IO) {
                EventLogger.logNudgeEvent(
                    riskLevel = score,
                    timestamp = msg.timestamp,
                    direction = "INCOMING",
                    messageId = msg.id
                )
            }
            triggerParentAlert()
        }
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

    fun ignoreMessage(messageId: String) {
        // Keeps bubble masked as requested
    }

    private fun addMessage(message: Message) {
        val currentList = _messages.value.orEmpty()
        _messages.value = currentList + message
    }

    private fun applySafeSendFilter(text: String): String {
        Masker.ensureInitialized(getApplication())
        return Masker.mask(text)
    }

    private fun triggerParentAlert() {
        NudgeAccessibilityService.instance?.let { service ->
            service.triggerOverlay(
                onEdit = {},
                onSendAnyway = {}
            )
        }
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

    private val _pendingChildMessage = MutableLiveData<Message?>(null)
    val pendingChildMessage: LiveData<Message?> = _pendingChildMessage

    private val flaggedTerms = listOf("stupid", "idiot", "hate you", "ugly", "loser", "dumb", "shut up")

    fun sendMessageAsChild(text: String) {
        if (text.isBlank()) return
        val score = Inference.scoreText(text)
        val riskLevel = if (score > 0.8f) RiskLevel.HIGH else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE

        val msg = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = Sender.CHILD,
            timestamp = System.currentTimeMillis(),
            riskLevel = riskLevel,
            displayText = text,
            isRevealed = (riskLevel == RiskLevel.SAFE)
        )

        if (riskLevel == RiskLevel.SAFE) {
            addMessage(msg)
        } else {
            _pendingChildMessage.value = msg
        }
    }

    fun confirmChildSendAnyway() {
        val msg = _pendingChildMessage.value ?: return
        _pendingChildMessage.value = null
        msg.displayText = applySafeSendFilter(msg.text)
        // Keep isRevealed = false so the receiver sees the warning
        addMessage(msg)

        val score = if (msg.riskLevel == RiskLevel.HIGH) 0.9f else 0.6f
        viewModelScope.launch(Dispatchers.IO) {
            EventLogger.logNudgeEvent(score, msg.timestamp, "OUTGOING", msg.id)
        }
        triggerOverlay()
    }

    fun cancelChildMessage() {
        _pendingChildMessage.value = null
    }

    fun sendMessageAsContact(text: String) {
        if (text.isBlank()) return
        val score = Inference.scoreText(text)
        val riskLevel = if (score > 0.8f) RiskLevel.HIGH else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE

        val filteredText = if (riskLevel != RiskLevel.SAFE) applySafeSendFilter(text) else text
        val msg = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = Sender.SIMULATED_CONTACT,
            timestamp = System.currentTimeMillis(),
            riskLevel = riskLevel,
            displayText = filteredText,
            isRevealed = (riskLevel == RiskLevel.SAFE)
        )
        addMessage(msg)

        if (riskLevel != RiskLevel.SAFE) {
            viewModelScope.launch(Dispatchers.IO) {
                EventLogger.logNudgeEvent(score, msg.timestamp, "INCOMING", msg.id)
            }
            triggerOverlay()
        }
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

    fun ignoreMessage(messageId: String) {
        // Keeps bubble masked as requested
    }

    private fun addMessage(message: Message) {
        val current = _messages.value.orEmpty()
        _messages.value = current + message
    }

    private fun applySafeSendFilter(text: String): String {
        Masker.ensureInitialized(getApplication())
        return Masker.mask(text)
    }

    private fun triggerOverlay() {
        NudgeAccessibilityService.instance?.triggerOverlay({}, {})
    }
}
