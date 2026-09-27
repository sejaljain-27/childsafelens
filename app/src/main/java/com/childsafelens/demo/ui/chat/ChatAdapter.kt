package com.childsafelens.demo.ui.chat

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.childsafelens.demo.R
import com.childsafelens.demo.data.model.Message
import com.childsafelens.demo.data.model.RiskLevel
import com.childsafelens.demo.data.model.Sender
import com.childsafelens.demo.ui.viewmodel.ChatViewModel
import com.childsafelens.demo.ui.viewmodel.SimulatorViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ChatAdapter(
    private val viewModel: ChatViewModel?,
    private val simulatorViewModel: SimulatorViewModel? = null,
    private val isChildPerspective: Boolean = true
) : ListAdapter<Message, RecyclerView.ViewHolder>(MessageDiffCallback()) {

    companion object {
        private const val VIEW_TYPE_RIGHT = 1
        private const val VIEW_TYPE_LEFT = 2
    }

    override fun getItemViewType(position: Int): Int {
        val message = getItem(position)
        return if (isChildPerspective) {
            if (message.sender == Sender.CHILD) VIEW_TYPE_RIGHT else VIEW_TYPE_LEFT
        } else {
            if (message.sender == Sender.SIMULATED_CONTACT) VIEW_TYPE_RIGHT else VIEW_TYPE_LEFT
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return if (viewType == VIEW_TYPE_RIGHT) {
            val view = inflater.inflate(R.layout.chat_message_item_child, parent, false)
            RightViewHolder(view)
        } else {
            val view = inflater.inflate(R.layout.chat_message_item_contact, parent, false)
            LeftViewHolder(view)
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val message = getItem(position)
        val timeStr = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(message.timestamp))

        if (holder is RightViewHolder) {
            holder.tvMessage.text = message.displayText
            holder.tvTime.text = timeStr
        } else if (holder is LeftViewHolder) {
            holder.tvTime.text = timeStr
            
            val isRisky = message.riskLevel == RiskLevel.MODERATE || message.riskLevel == RiskLevel.HIGH
            
            if (isRisky && !message.isRevealed) {
                holder.layoutMaskedWarning.visibility = View.VISIBLE
                holder.tvMessage.visibility = View.GONE
                
                holder.btnView.setOnClickListener {
                    if (viewModel != null) {
                        viewModel.revealMessage(message.id)
                    } else if (simulatorViewModel != null) {
                        simulatorViewModel.revealMessage(message.id)
                    }
                }
                holder.btnIgnore.setOnClickListener {
                    if (viewModel != null) {
                        viewModel.ignoreMessage(message.id)
                    } else if (simulatorViewModel != null) {
                        simulatorViewModel.ignoreMessage(message.id)
                    }
                }
            } else {
                holder.layoutMaskedWarning.visibility = View.GONE
                holder.tvMessage.visibility = View.VISIBLE
                holder.tvMessage.text = message.displayText
            }
        }
    }

    class RightViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvMessage: TextView = view.findViewById(R.id.tvMessageChild)
        val tvTime: TextView = view.findViewById(R.id.tvTimeChild)
    }

    class LeftViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvMessage: TextView = view.findViewById(R.id.tvMessageContact)
        val tvTime: TextView = view.findViewById(R.id.tvTimeContact)
        val layoutMaskedWarning: View = view.findViewById(R.id.layoutMaskedWarning)
        val btnView: Button = view.findViewById(R.id.btnViewMasked)
        val btnIgnore: Button = view.findViewById(R.id.btnIgnoreMasked)
    }

    class MessageDiffCallback : DiffUtil.ItemCallback<Message>() {
        override fun areItemsTheSame(oldItem: Message, newItem: Message): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: Message, newItem: Message): Boolean {
            return oldItem == newItem
        }
    }
}
