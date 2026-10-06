package com.childsafelens.demo.data.model

data class Message(
    val id: String,
    val text: String,
    val sender: Sender,
    val timestamp: Long,
    val riskLevel: RiskLevel = RiskLevel.PENDING,
    var displayText: String = text,
    var isRevealed: Boolean = false,
    var visibleToReceiver: Boolean = true,
    var isBlockedByParent: Boolean = false,
    val classificationStatus: String? = null
)

fun Message.isVisibleTo(viewer: Sender): Boolean =
    viewer == sender || visibleToReceiver

fun Message.textFor(viewer: Sender): String =
    if (viewer == sender) text else if (isVisibleTo(viewer)) displayText else ""

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
