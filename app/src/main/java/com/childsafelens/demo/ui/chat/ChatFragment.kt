package com.childsafelens.demo.ui.chat

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.widget.Toolbar
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.childsafelens.demo.R
import com.childsafelens.demo.data.model.Message
import com.childsafelens.demo.security.SessionManager
import com.childsafelens.demo.ui.viewmodel.ChatViewModel
import com.google.android.material.bottomsheet.BottomSheetDialog

class ChatFragment : Fragment() {

    private val viewModel: ChatViewModel by viewModels()
    private lateinit var sessionManager: SessionManager
    private lateinit var etMessageInput: EditText
    private lateinit var rvChat: RecyclerView
    private lateinit var adapter: ChatAdapter
    private var warningBottomSheet: BottomSheetDialog? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_chat, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        sessionManager = SessionManager(requireContext())
        etMessageInput = view.findViewById(R.id.etMessageInput)
        rvChat = view.findViewById(R.id.rvChat)

        // Setup Toolbar
        val chatToolbar = view.findViewById<Toolbar>(R.id.chatToolbar)
        val childName = sessionManager.getActiveChildProfile() ?: "Child"
        chatToolbar.title = "Chat: $childName"
        chatToolbar.inflateMenu(R.menu.chat_menu)
        chatToolbar.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                R.id.action_settings -> {
                    findNavController().navigate(R.id.action_chatFragment_to_reAuthFragment)
                    true
                }
                R.id.action_simulator -> {
                    findNavController().navigate(R.id.action_chatFragment_to_dualChatFragment)
                    true
                }
                else -> false
            }
        }

        // Setup RecyclerView
        adapter = ChatAdapter(viewModel)
        rvChat.layoutManager = LinearLayoutManager(context).apply {
            stackFromEnd = true
        }
        rvChat.adapter = adapter

        // Observe Messages
        viewModel.messages.observe(viewLifecycleOwner) { messageList ->
            adapter.submitList(messageList) {
                if (messageList.isNotEmpty()) {
                    rvChat.scrollToPosition(messageList.size - 1)
                }
            }
        }

        // Observe Outgoing Flagged message
        viewModel.pendingOutgoingMessage.observe(viewLifecycleOwner) { pendingMsg ->
            if (pendingMsg != null) {
                showWarningBottomSheet(pendingMsg)
            } else {
                warningBottomSheet?.dismiss()
            }
        }

        // Send Button Click
        view.findViewById<Button>(R.id.btnSendMessage).setOnClickListener {
            val text = etMessageInput.text.toString().trim()
            if (text.isNotEmpty()) {
                viewModel.sendMessage(text)
                // Clear input only if not flagged (if flagged, it will copy to bottom sheet and keep text on edit)
                if (viewModel.pendingOutgoingMessage.value == null) {
                    etMessageInput.text.clear()
                }
            }
        }

        // Preset Message Injectors
        view.findViewById<Button>(R.id.btnInjectSafe1).setOnClickListener {
            viewModel.injectPresetMessage("Are we still playing soccer today?")
        }
        view.findViewById<Button>(R.id.btnInjectSafe2).setOnClickListener {
            viewModel.injectPresetMessage("Let's finish our homework first.")
        }
        view.findViewById<Button>(R.id.btnInjectModerate).setOnClickListener {
            viewModel.injectPresetMessage("Shut up, you are a loser!")
        }
        view.findViewById<Button>(R.id.btnInjectHigh).setOnClickListener {
            viewModel.injectPresetMessage("I hate you so much, you are ugly!")
        }
    }

    private fun showWarningBottomSheet(message: Message) {
        val ctx = context ?: return
        val dialog = BottomSheetDialog(ctx)
        val sheetView = layoutInflater.inflate(R.layout.nudge_warning_bottom_sheet, null)
        dialog.setContentView(sheetView)

        sheetView.findViewById<Button>(R.id.btnEditMessage).setOnClickListener {
            dialog.dismiss()
            viewModel.cancelPendingMessage()
            etMessageInput.requestFocus()
            etMessageInput.setSelection(etMessageInput.text.length)
        }

        sheetView.findViewById<Button>(R.id.btnSendAnyway).setOnClickListener {
            dialog.dismiss()
            viewModel.confirmSendAnyway()
            etMessageInput.text.clear()
        }

        dialog.setOnCancelListener {
            viewModel.cancelPendingMessage()
        }

        warningBottomSheet = dialog
        dialog.show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        warningBottomSheet?.dismiss()
    }
}
