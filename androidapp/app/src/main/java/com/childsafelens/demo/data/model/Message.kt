package com.childsafelens.demo.data.model

data class Message(
    val id: String,
    val text: String,
    val sender: Sender,
    val timestamp: Long,
    val riskLevel: RiskLevel = RiskLevel.PENDING,
    var displayText: String = text,
    var isRevealed: Boolean = false,
    var visibleToReceiver: Boolean = true
)

enum class Sender {
    CHILD,
    SIMULATED_CONTACT
}

enum class RiskLevel {
    PENDING,
    SAFE,
    MODERATE,
    HIGH
}
