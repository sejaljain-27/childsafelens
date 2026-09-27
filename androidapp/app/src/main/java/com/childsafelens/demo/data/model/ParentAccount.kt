package com.childsafelens.demo.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "parent_accounts")
data class ParentAccount(
    @PrimaryKey
    val email: String,
    val passwordHash: String,
    val salt: String
)
