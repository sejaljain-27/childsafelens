package com.childsafelens.demo.ui.parent

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.childsafelens.demo.R
import com.childsafelens.demo.data.model.IncidentEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DashboardAdapter : ListAdapter<IncidentEntity, DashboardAdapter.EventViewHolder>(EventDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): EventViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.dashboard_event_item, parent, false)
        return EventViewHolder(view)
    }

    override fun onBindViewHolder(holder: EventViewHolder, position: Int) {
        val incident = getItem(position)
        
        val dateStr = SimpleDateFormat("MMM d, yyyy • h:mm a", Locale.getDefault()).format(Date(incident.timestamp))
        holder.tvTimestamp.text = dateStr
        
        holder.tvDirection.text = "• ${incident.type}"
        holder.tvMsgId.text = "\"${incident.messageSnippet}\""

        // Custom Risk Level Styling
        val risk = incident.riskScore
        if (risk > 0.8f || incident.riskLevel.equals("HIGH", true) || incident.riskLevel.equals("CRITICAL", true)) {
            holder.tvRiskLabel.text = "HIGH RISK"
            holder.tvRiskLabel.setTextColor(0xFFDC2626.toInt()) // Red
            holder.viewRiskIndicator.setBackgroundColor(0xFFDC2626.toInt())
        } else if (risk > 0.5f || incident.riskLevel.equals("MEDIUM", true)) {
            holder.tvRiskLabel.text = "MODERATE RISK"
            holder.tvRiskLabel.setTextColor(0xFFD97706.toInt()) // Amber
            holder.viewRiskIndicator.setBackgroundColor(0xFFD97706.toInt())
        } else {
            holder.tvRiskLabel.text = "SAFE / LOW RISK"
            holder.tvRiskLabel.setTextColor(0xFF16A34A.toInt()) // Green
            holder.viewRiskIndicator.setBackgroundColor(0xFF16A34A.toInt())
        }
    }

    class EventViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val viewRiskIndicator: View = view.findViewById(R.id.viewRiskIndicator)
        val tvRiskLabel: TextView = view.findViewById(R.id.tvEventRiskLabel)
        val tvDirection: TextView = view.findViewById(R.id.tvEventDirection)
        val tvMsgId: TextView = view.findViewById(R.id.tvEventMsgId)
        val tvTimestamp: TextView = view.findViewById(R.id.tvEventTimestamp)
    }

    class EventDiffCallback : DiffUtil.ItemCallback<IncidentEntity>() {
        override fun areItemsTheSame(oldItem: IncidentEntity, newItem: IncidentEntity): Boolean {
            return oldItem.incidentId == newItem.incidentId
        }

        override fun areContentsTheSame(oldItem: IncidentEntity, newItem: IncidentEntity): Boolean {
            return oldItem == newItem
        }
    }
}
