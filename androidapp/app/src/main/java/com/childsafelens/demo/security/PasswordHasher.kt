package com.childsafelens.demo.security

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

object PasswordHasher {
    fun generateSalt(): String {
        val random = SecureRandom()
        val saltBytes = ByteArray(16)
        random.nextBytes(saltBytes)
        return Base64.encodeToString(saltBytes, Base64.NO_WRAP)
    }

    fun hashPassword(password: String, salt: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val saltBytes = Base64.decode(salt, Base64.NO_WRAP)
        md.update(saltBytes)
        val hashedBytes = md.digest(password.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(hashedBytes, Base64.NO_WRAP)
    }
}
