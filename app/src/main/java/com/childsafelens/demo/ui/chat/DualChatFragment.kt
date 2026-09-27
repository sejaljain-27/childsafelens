package com.childsafelens.demo.ui.chat

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.widget.Toolbar
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.childsafelens.demo.R
import com.childsafelens.demo.ui.viewmodel.SimulatorViewModel
import com.google.android.material.bottomsheet.BottomSheetDialog

class DualChatFragment : Fragment() {

    private val viewModel: SimulatorViewModel by viewModels()
    
    private lateinit var rvChild: RecyclerView
    private lateinit var rvContact: RecyclerView
    private lateinit var etChildInput: EditText
    private lateinit var etContactInput: EditText
    
    private lateinit var adapterChild: ChatAdapter
    private lateinit var adapterContact: ChatAdapter

    private var warningBottomSheet: BottomSheetDialog? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_dual_chat, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val toolbar = view.findViewById<Toolbar>(R.id.dualChatToolbar)
        toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        rvChild = view.findViewById(R.id.rvChildPerspective)
        rvContact = view.findViewById(R.id.rvContactPerspective)
        etChildInput = view.findViewById(R.id.etChildInput)
        etContactInput = view.findViewById(R.id.etContactInput)

        // Setup Adapters
        adapterChild = ChatAdapter(viewModel = null, simulatorViewModel = viewModel, isChildPerspective = true)
        adapterContact = ChatAdapter(viewModel = null, simulatorViewModel = viewModel, isChildPerspective = false)

        rvChild.layoutManager = LinearLayoutManager(context).apply { stackFromEnd = true }
        rvContact.layoutManager = LinearLayoutManager(context).apply { stackFromEnd = true }
        
        rvChild.adapter = adapterChild
        rvContact.adapter = adapterContact

        // Observe Messages
        viewModel.messages.observe(viewLifecycleOwner) { list ->
            adapterChild.submitList(list) {
                if (list.isNotEmpty()) rvChild.scrollToPosition(list.size - 1)
            }
            adapterContact.submitList(list) {
                if (list.isNotEmpty()) rvContact.scrollToPosition(list.size - 1)
            }
        }

        // Observe Nudge
        viewModel.pendingChildMessage.observe(viewLifecycleOwner) { pending ->
            if (pending != null) {
                showNudgeBottomSheet()
            } else {
                warningBottomSheet?.dismiss()
            }
        }

        // Send Buttons
        view.findViewById<Button>(R.id.btnChildSend).setOnClickListener {
            val text = etChildInput.text.toString().trim()
            if (text.isNotEmpty()) {
                viewModel.sendMessageAsChild(text)
                if (viewModel.pendingChildMessage.value == null) {
                    etChildInput.text.clear()
                }
            }
        }

        view.findViewById<Button>(R.id.btnContactSend).setOnClickListener {
            val text = etContactInput.text.toString().trim()
            if (text.isNotEmpty()) {
                viewModel.sendMessageAsContact(text)
                etContactInput.text.clear()
            }
        }
    }

    private fun showNudgeBottomSheet() {
        val ctx = context ?: return
        val dialog = BottomSheetDialog(ctx)
        val sheetView = layoutInflater.inflate(R.layout.nudge_warning_bottom_sheet, null)
        dialog.setContentView(sheetView)

        sheetView.findViewById<Button>(R.id.btnEditMessage).setOnClickListener {
            dialog.dismiss()
            viewModel.cancelChildMessage()
            etChildInput.requestFocus()
        }

        sheetView.findViewById<Button>(R.id.btnSendAnyway).setOnClickListener {
            dialog.dismiss()
            viewModel.confirmChildSendAnyway()
            etChildInput.text.clear()
        }

        dialog.setOnCancelListener {
            viewModel.cancelChildMessage()
        }

        warningBottomSheet = dialog
        dialog.show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        warningBottomSheet?.dismiss()
    }
}
