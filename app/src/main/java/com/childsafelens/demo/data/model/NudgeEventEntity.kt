package com.childsafelens.demo.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "nudge_events")
data class NudgeEventEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val riskLevel: Float,
    val timestamp: Long,
    val direction: String, // "OUTGOING" or "INCOMING"
    val messageId: String
)
