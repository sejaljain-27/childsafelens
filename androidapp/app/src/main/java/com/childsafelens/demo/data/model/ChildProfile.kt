package com.childsafelens.demo.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "child_profiles")
data class ChildProfile(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val parentEmail: String,
    val displayName: String
)
