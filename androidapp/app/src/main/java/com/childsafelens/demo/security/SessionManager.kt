package com.childsafelens.demo.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

class SessionManager(context: Context) {

    private val sharedPreferences: SharedPreferences by lazy {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        EncryptedSharedPreferences.create(
            "parent_session_prefs",
            masterKeyAlias,
            context.applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    companion object {
        private const val KEY_PARENT_EMAIL = "parent_email"
        private const val KEY_CHILD_DISPLAY_NAME = "child_display_name"
        private const val KEY_ACCESS_TOKEN = "access_token"
    }

    fun loginParent(email: String) {
        sharedPreferences.edit().putString(KEY_PARENT_EMAIL, email).apply()
    }

    fun logout() {
        sharedPreferences.edit()
            .remove(KEY_PARENT_EMAIL)
            .remove(KEY_CHILD_DISPLAY_NAME)
            .remove(KEY_ACCESS_TOKEN)
            .apply()
    }

    fun setAccessToken(token: String) {
        sharedPreferences.edit().putString(KEY_ACCESS_TOKEN, token).apply()
    }

    fun getAccessToken(): String? {
        return sharedPreferences.getString(KEY_ACCESS_TOKEN, null)
    }

    fun getParentEmail(): String? {
        return sharedPreferences.getString(KEY_PARENT_EMAIL, null)
    }

    fun isParentLoggedIn(): Boolean {
        return getParentEmail() != null
    }

    fun setActiveChildProfile(displayName: String) {
        sharedPreferences.edit().putString(KEY_CHILD_DISPLAY_NAME, displayName).apply()
    }

    fun getActiveChildProfile(): String? {
        return sharedPreferences.getString(KEY_CHILD_DISPLAY_NAME, null)
    }

    fun clearActiveChildProfile() {
        sharedPreferences.edit().remove(KEY_CHILD_DISPLAY_NAME).apply()
    }
}
