package com.childsafelens.demo.ui.chat

import android.app.AlertDialog
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

class DualChatFragment : Fragment() {

    private val viewModel: SimulatorViewModel by viewModels()
    
    private lateinit var rvChild: RecyclerView
    private lateinit var rvContact: RecyclerView
    private lateinit var etChildInput: EditText
    private lateinit var etContactInput: EditText
    
    private lateinit var adapterChild: ChatAdapter
    private lateinit var adapterContact: ChatAdapter
    private var waitingDialog: AlertDialog? = null

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

        // Observe Pending Approval State
        viewModel.pendingApprovalState.observe(viewLifecycleOwner) { isPending ->
            if (isPending) {
                if (waitingDialog == null) {
                    waitingDialog = AlertDialog.Builder(requireContext())
                        .setTitle("Pending Review")
                        .setMessage("⏳ Waiting for parent approval...")
                        .setCancelable(false)
                        .create()
                }
                waitingDialog?.show()
            } else {
                waitingDialog?.dismiss()
                waitingDialog = null
            }
        }

        // Send Buttons
        view.findViewById<Button>(R.id.btnChildSend).setOnClickListener {
            val text = etChildInput.text.toString().trim()
            if (text.isNotEmpty()) {
                viewModel.sendMessageAsChild(text)
                etChildInput.text.clear()
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

    override fun onDestroyView() {
        super.onDestroyView()
        waitingDialog?.dismiss()
        waitingDialog = null
    }
}
