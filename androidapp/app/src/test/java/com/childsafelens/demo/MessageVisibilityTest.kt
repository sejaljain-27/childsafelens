package com.childsafelens.demo

import com.childsafelens.demo.data.model.Message
import com.childsafelens.demo.data.model.Sender
import com.childsafelens.demo.data.model.isVisibleTo
import com.childsafelens.demo.data.model.textFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MessageVisibilityTest {

    @Test
    fun blockedOutgoingMessageRemainsVisibleToSenderButNotRecipient() {
        val message = Message(
            id = "blocked-outgoing",
            text = "Original message",
            sender = Sender.CHILD,
            timestamp = 0,
            displayText = "",
            visibleToReceiver = false,
            isBlockedByParent = true,
        )

        assertTrue(message.isVisibleTo(Sender.CHILD))
        assertFalse(message.isVisibleTo(Sender.SIMULATED_CONTACT))
        assertEquals("Original message", message.textFor(Sender.CHILD))
        assertEquals("", message.textFor(Sender.SIMULATED_CONTACT))
    }

    @Test
    fun blockedIncomingMessageRemainsVisibleToSenderButNotRecipient() {
        val message = Message(
            id = "blocked-incoming",
            text = "Original message",
            sender = Sender.SIMULATED_CONTACT,
            timestamp = 0,
            displayText = "",
            visibleToReceiver = false,
            isBlockedByParent = true,
        )

        assertTrue(message.isVisibleTo(Sender.SIMULATED_CONTACT))
        assertFalse(message.isVisibleTo(Sender.CHILD))
        assertEquals("Original message", message.textFor(Sender.SIMULATED_CONTACT))
        assertEquals("", message.textFor(Sender.CHILD))
    }

    @Test
    fun allowedMessageIsVisibleToBothPerspectivesWithRecipientContent() {
        val message = Message(
            id = "allowed",
            text = "Original message",
            sender = Sender.CHILD,
            timestamp = 0,
            displayText = "Parent-approved message",
            visibleToReceiver = true,
        )

        assertTrue(message.isVisibleTo(Sender.CHILD))
        assertTrue(message.isVisibleTo(Sender.SIMULATED_CONTACT))
        assertEquals("Original message", message.textFor(Sender.CHILD))
        assertEquals("Parent-approved message", message.textFor(Sender.SIMULATED_CONTACT))
    }
}
