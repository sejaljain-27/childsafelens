package com.childsafelens.demo.ui.chat

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.childsafelens.demo.R
import com.childsafelens.demo.data.model.Message
import com.childsafelens.demo.data.model.Sender
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ChatAdapter(
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
        holder.itemView.visibility = if (message.displayText.isBlank()) View.GONE else View.VISIBLE

        if (holder is RightViewHolder) {
            holder.tvMessage.text = message.displayText
            holder.tvTime.text = timeStr
        } else if (holder is LeftViewHolder) {
            holder.tvTime.text = timeStr
            if (message.isBlockedByParent) {
                holder.tvMessage.text = "⚠️ You can't view this message"
            } else {
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
