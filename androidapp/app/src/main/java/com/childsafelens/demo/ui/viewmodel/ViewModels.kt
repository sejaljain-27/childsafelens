package com.childsafelens.demo.ui.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.asLiveData
import androidx.lifecycle.viewModelScope
import com.childsafelens.demo.BackendAccountClient
import com.childsafelens.demo.BackendApiException
import com.childsafelens.demo.BackendClassifierClient
import com.childsafelens.demo.ClassificationResult
import com.childsafelens.demo.EventLogger
import com.childsafelens.demo.IncidentManager
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
import java.util.Locale
import java.util.UUID

class AuthViewModel(application: Application) : AndroidViewModel(application) {
    private val db = AppDatabase.getDatabase(application)
    private val parentDao = db.parentAccountDao()
    private val childDao = db.childProfileDao()
    val sessionManager = SessionManager(application)

    fun checkSession(onResult: (isLoggedIn: Boolean, hasChild: Boolean, error: String?) -> Unit) {
        val email = sessionManager.getParentEmail()
        if (email != null) {
            val accessToken = sessionManager.getAccessToken()
            if (accessToken.isNullOrBlank()) {
                sessionManager.logout()
                onResult(false, false, "Please sign in again to refresh your secure session.")
                return
            }
            viewModelScope.launch {
                try {
                    val hasChild = withContext(Dispatchers.IO) {
                        val localProfiles = childDao.getChildProfilesForParent(email)
                        val remoteNames = BackendAccountClient.getChildProfiles(email, accessToken)
                        localProfiles.forEach { profile ->
                            if (!remoteNames.any { it.equals(profile.displayName, ignoreCase = true) }) {
                                BackendAccountClient.createChildProfile(email, profile.displayName, accessToken)
                            }
                        }
                        val connectedNames = BackendAccountClient.getChildProfiles(email, accessToken)
                        connectedNames.forEach { name ->
                            if (localProfiles.none { it.displayName.equals(name, ignoreCase = true) }) {
                                childDao.insert(ChildProfile(parentEmail = email, displayName = name))
                            }
                        }
                        connectedNames.isNotEmpty()
                    }
                    if (hasChild && sessionManager.getActiveChildProfile() == null) {
                        val profiles = withContext(Dispatchers.IO) {
                            childDao.getChildProfilesForParent(email)
                        }
                        sessionManager.setActiveChildProfile(profiles.first().displayName)
                    }
                    onResult(true, hasChild, null)
                } catch (error: Exception) {
                    Log.e("AuthViewModel", "Unable to refresh linked child profiles.", error)
                    onResult(false, false, error.message ?: "Unable to verify the parent account with the backend.")
                }
            }
        } else {
            onResult(false, false, null)
        }
    }

    fun login(email: String, password: String, onResult: (success: Boolean, error: String?) -> Unit) {
        val normalizedEmail = email.trim().lowercase(Locale.ROOT)
        if (normalizedEmail.isBlank() || password.isBlank()) {
            onResult(false, "Fields cannot be empty")
            return
        }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val authSession = try {
                        BackendAccountClient.login(normalizedEmail, password)
                    } catch (error: BackendApiException) {
                        if (error.statusCode != 401) throw error
                        val localAccount = parentDao.getParentAccount(normalizedEmail)
                        if (localAccount == null ||
                            PasswordHasher.hashPassword(password, localAccount.salt) != localAccount.passwordHash
                        ) {
                            throw error
                        }
                        try {
                            BackendAccountClient.register(normalizedEmail, password, "")
                        } catch (registrationError: BackendApiException) {
                            if (registrationError.statusCode != 409) throw registrationError
                            BackendAccountClient.login(normalizedEmail, password)
                        }
                    }
                    sessionManager.setAccessToken(authSession.accessToken)

                    val salt = PasswordHasher.generateSalt()
                    parentDao.insert(
                        ParentAccount(
                            normalizedEmail,
                            PasswordHasher.hashPassword(password, salt),
                            salt
                        )
                    )
                    val remoteNames = BackendAccountClient.getChildProfiles(
                        normalizedEmail,
                        authSession.accessToken
                    )
                    val localProfiles = childDao.getChildProfilesForParent(normalizedEmail)
                    remoteNames.forEach { name ->
                        if (localProfiles.none { it.displayName.equals(name, ignoreCase = true) }) {
                            childDao.insert(ChildProfile(parentEmail = normalizedEmail, displayName = name))
                        }
                    }
                }
                sessionManager.loginParent(normalizedEmail)
                val profiles = withContext(Dispatchers.IO) {
                    childDao.getChildProfilesForParent(normalizedEmail)
                }
                if (profiles.isNotEmpty()) sessionManager.setActiveChildProfile(profiles.first().displayName)
                onResult(true, null)
            } catch (error: Exception) {
                onResult(false, error.message ?: "Unable to connect to the parent account service.")
            }
        }
    }

    fun signup(email: String, password: String, onResult: (success: Boolean, error: String?) -> Unit) {
        val normalizedEmail = email.trim().lowercase(Locale.ROOT)
        if (normalizedEmail.isBlank() || password.length < 6) {
            onResult(false, "Enter a valid email and a password with at least 6 characters.")
            return
        }
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val authSession = BackendAccountClient.register(normalizedEmail, password, "")
                    sessionManager.setAccessToken(authSession.accessToken)
                    val salt = PasswordHasher.generateSalt()
                    val passwordHash = PasswordHasher.hashPassword(password, salt)
                    parentDao.insert(ParentAccount(normalizedEmail, passwordHash, salt))
                }
                sessionManager.loginParent(normalizedEmail)
                onResult(true, null)
            } catch (error: Exception) {
                onResult(false, error.message ?: "Unable to create the parent account.")
            }
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
            try {
                withContext(Dispatchers.IO) {
                    val accessToken = sessionManager.getAccessToken()
                        ?: throw IllegalStateException("Please sign in again to refresh your secure session.")
                    BackendAccountClient.createChildProfile(email, displayName, accessToken)
                    val existing = childDao.getChildProfilesForParent(email)
                    if (existing.none { it.displayName.equals(displayName, ignoreCase = true) }) {
                        childDao.insert(ChildProfile(parentEmail = email, displayName = displayName))
                    }
                }
                sessionManager.setActiveChildProfile(displayName.trim())
                onResult(true, null)
            } catch (error: Exception) {
                onResult(false, error.message ?: "Unable to connect this child profile to the parent account.")
            }
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

    fun sendMessage(text: String) {
        classifyMessage(text, Sender.CHILD, "OUTGOING")
    }

    fun injectPresetMessage(text: String) {
        classifyMessage(text, Sender.SIMULATED_CONTACT, "INCOMING")
    }

    private fun classifyMessage(text: String, sender: Sender, type: String) {
        if (text.isBlank()) return
        val incidentId = "INC_${UUID.randomUUID().hashCode().toUInt().toString(16)}"
        val isIncoming = (type == "INCOMING")
        val message = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = sender,
            timestamp = System.currentTimeMillis(),
            displayText = "",
            isRevealed = !isIncoming,
            visibleToReceiver = false,
            classificationStatus = "Checking backend"
        )
        addMessage(message)

        viewModelScope.launch(Dispatchers.IO) {
            val result = BackendClassifierClient.classify(text) { rechecked ->
                applyClassificationResult(message, incidentId, type, text, rechecked)
            }
            withContext(Dispatchers.Main) {
                applyClassificationResult(message, incidentId, type, text, result)
            }
        }
    }

    private fun applyClassificationResult(
        message: Message,
        incidentId: String,
        type: String,
        text: String,
        result: ClassificationResult
    ) {
        if (result.offlineUnverified) {
            setClassificationState(
                message.id,
                RiskLevel.PENDING,
                "Offline / unverified (queued for recheck)",
                text,
                true
            )
            return
        }

        if (result.label == "Clean") {
            setClassificationState(
                message.id,
                RiskLevel.SAFE,
                if (result.developmentSimulation) "Development / simulation" else "Backend verified",
                text,
                true
            )
            return
        }
        if (!result.shouldCreateIncident) return

        val score = result.riskScore
        val policy = RiskPolicyManager.evaluateForClassification(score, result.label.orEmpty())
        val filteredText = applySafeSendFilter(text)
        val riskLevel = if (score > 0.8f) RiskLevel.HIGH
            else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE

        val isIncoming = (type == "INCOMING")
        if (!isIncoming) {
            setClassificationState(
                message.id,
                riskLevel,
                if (result.developmentSimulation) "Development / simulation" else "Backend verified",
                filteredText,
                true
            )
            IncidentManager.createAndSendIncident(
                incidentId = incidentId,
                type = type,
                message = text,
                riskScore = score,
                riskLevel = policy.riskLevel,
                category = result.category ?: "potential_cyberbullying",
                packageName = "com.childsafelens.demo",
                predictionToken = result.predictionToken,
                status = "ALLOWED"
            )
            return
        }

        val hideInitially = policy.requiresParentApproval
        setClassificationState(
            message.id,
            riskLevel,
            if (result.developmentSimulation) "Development / simulation" else "Backend verified",
            if (hideInitially) "[Message held for parent review]" else text,
            !hideInitially
        )

        IncidentManager.createAndSendIncident(
            incidentId = incidentId,
            type = type,
            message = text,
            riskScore = score,
            riskLevel = policy.riskLevel,
            category = result.category ?: "potential_cyberbullying",
            packageName = "com.childsafelens.demo",
            predictionToken = result.predictionToken,
            status = if (policy.requiresParentApproval) "PENDING_PARENT_REVIEW" else "ALLOWED",
            onDecisionReceived = { decision, _ ->
                viewModelScope.launch(Dispatchers.Main) {
                    when (decision.uppercase()) {
                        "ALLOW", "SHOW" -> updateMessageState(message.id, filteredText, true, false)
                        "BLOCK", "HIDE" -> updateMessageState(message.id, "[Blocked by parent]", false, true)
                        "EDIT" -> updateMessageState(message.id, "[Message blocked]", false, true)
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

    private fun updateMessageState(messageId: String, newText: String, visibleToReceiver: Boolean, isBlockedByParent: Boolean) {
        val currentList = _messages.value.orEmpty()
        val updated = currentList.map {
            if (it.id == messageId) {
                it.copy(displayText = newText, visibleToReceiver = visibleToReceiver, isBlockedByParent = isBlockedByParent)
            } else {
                it
            }
        }
        _messages.value = updated
    }

    private fun setClassificationState(
        messageId: String,
        riskLevel: RiskLevel,
        classificationStatus: String,
        displayText: String,
        visibleToReceiver: Boolean
    ) {
        _messages.value = _messages.value.orEmpty().map { message ->
            if (message.id == messageId) {
                message.copy(
                    riskLevel = riskLevel,
                    classificationStatus = classificationStatus,
                    displayText = displayText,
                    visibleToReceiver = visibleToReceiver
                )
            } else {
                message
            }
        }
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
    private val incidentDao = db.incidentDao()

    val nudgeEvents: LiveData<List<com.childsafelens.demo.data.model.IncidentEntity>> = incidentDao.getAllIncidentsFlow().asLiveData()
}

class SimulatorViewModel(application: Application) : AndroidViewModel(application) {
    private val _messages = MutableLiveData<List<Message>>(emptyList())
    val messages: LiveData<List<Message>> = _messages

    fun sendMessageAsChild(text: String) {
        classifyMessage(text, Sender.CHILD, "OUTGOING")
    }

    fun sendMessageAsContact(text: String) {
        classifyMessage(text, Sender.SIMULATED_CONTACT, "INCOMING")
    }

    private fun classifyMessage(text: String, sender: Sender, type: String) {
        if (text.isBlank()) return
        val incidentId = "INC_${UUID.randomUUID().hashCode().toUInt().toString(16)}"
        val isIncoming = (type == "INCOMING")
        val message = Message(
            id = UUID.randomUUID().toString(),
            text = text,
            sender = sender,
            timestamp = System.currentTimeMillis(),
            displayText = "",
            isRevealed = !isIncoming,
            visibleToReceiver = false,
            classificationStatus = "Checking backend"
        )
        addMessage(message)
        viewModelScope.launch(Dispatchers.IO) {
            val result = BackendClassifierClient.classify(text) { rechecked ->
                applyClassificationResult(message, incidentId, type, text, rechecked)
            }
            withContext(Dispatchers.Main) {
                applyClassificationResult(message, incidentId, type, text, result)
            }
        }
    }

    private fun applyClassificationResult(
        message: Message,
        incidentId: String,
        type: String,
        text: String,
        result: ClassificationResult
    ) {
        if (result.offlineUnverified) {
            setClassificationState(
                message.id,
                RiskLevel.PENDING,
                "Offline / unverified (queued for recheck)",
                text,
                true
            )
            return
        }

        if (result.label == "Clean") {
            setClassificationState(
                message.id,
                RiskLevel.SAFE,
                if (result.developmentSimulation) "Development / simulation" else "Backend verified",
                text,
                true
            )
            return
        }
        if (!result.shouldCreateIncident) return

        val score = result.riskScore
        val policy = RiskPolicyManager.evaluateForClassification(score, result.label.orEmpty())
        val filteredText = applySafeSendFilter(text)
        val riskLevel = if (score > 0.8f) RiskLevel.HIGH
            else if (score > 0.5f) RiskLevel.MODERATE else RiskLevel.SAFE

        val isIncoming = (type == "INCOMING")
        if (!isIncoming) {
            setClassificationState(
                message.id,
                riskLevel,
                if (result.developmentSimulation) "Development / simulation" else "Backend verified",
                filteredText,
                true
            )
            IncidentManager.createAndSendIncident(
                incidentId = incidentId,
                type = type,
                message = text,
                riskScore = score,
                riskLevel = policy.riskLevel,
                category = result.category ?: "potential_cyberbullying",
                packageName = "com.childsafelens.demo",
                predictionToken = result.predictionToken,
                status = "ALLOWED"
            )
            return
        }

        val hideInitially = policy.requiresParentApproval
        setClassificationState(
            message.id,
            riskLevel,
            if (result.developmentSimulation) "Development / simulation" else "Backend verified",
            if (hideInitially) "[Message held for parent review]" else text,
            !hideInitially
        )

        IncidentManager.createAndSendIncident(
            incidentId = incidentId,
            type = type,
            message = text,
            riskScore = score,
            riskLevel = policy.riskLevel,
            category = result.category ?: "potential_cyberbullying",
            packageName = "com.childsafelens.demo",
            predictionToken = result.predictionToken,
            status = if (policy.requiresParentApproval) "PENDING_PARENT_REVIEW" else "ALLOWED",
            onDecisionReceived = { decision, _ ->
                viewModelScope.launch(Dispatchers.Main) {
                    when (decision.uppercase()) {
                        "ALLOW", "SHOW" -> updateMessageState(message.id, filteredText, true, false)
                        "BLOCK", "HIDE" -> updateMessageState(message.id, "[Blocked by parent]", false, true)
                        "EDIT" -> updateMessageState(message.id, "[Message blocked]", false, true)
                    }
                }
            }
        )
    }

    private fun setClassificationState(
        messageId: String,
        riskLevel: RiskLevel,
        classificationStatus: String,
        displayText: String,
        visibleToReceiver: Boolean
    ) {
        _messages.value = _messages.value.orEmpty().map { message ->
            if (message.id == messageId) {
                message.copy(
                    riskLevel = riskLevel,
                    classificationStatus = classificationStatus,
                    displayText = displayText,
                    visibleToReceiver = visibleToReceiver
                )
            } else {
                message
            }
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

    private fun updateMessageState(messageId: String, newText: String, visibleToReceiver: Boolean, isBlockedByParent: Boolean) {
        val currentList = _messages.value.orEmpty()
        val updated = currentList.map {
            if (it.id == messageId) {
                it.copy(displayText = newText, visibleToReceiver = visibleToReceiver, isBlockedByParent = isBlockedByParent)
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
