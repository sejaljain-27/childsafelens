package com.childsafelens.demo.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "incidents")
data class IncidentEntity(
    @PrimaryKey
    val incidentId: String,
    val parentEmail: String,
    val childId: String,
    val childName: String,
    val type: String, // "OUTGOING" or "INCOMING"
    val messageSnippet: String,
    val riskScore: Float,
    val riskLevel: String, // "LOW", "MEDIUM", "HIGH", "CRITICAL"
    val category: String,
    val packageName: String,
    val timestamp: Long,
    val status: String, // "PENDING", "ALLOWED", "BLOCKED", "EDIT", "TIMEOUT"
    val parentDecision: String? = null
)
