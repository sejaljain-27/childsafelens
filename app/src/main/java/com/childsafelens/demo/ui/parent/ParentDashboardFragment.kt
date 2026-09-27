package com.childsafelens.demo.ui.parent

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import androidx.appcompat.widget.Toolbar
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.childsafelens.demo.R
import com.childsafelens.demo.ui.viewmodel.DashboardViewModel

class ParentDashboardFragment : Fragment() {

    private val viewModel: DashboardViewModel by viewModels()
    private lateinit var rvEvents: RecyclerView
    private lateinit var emptyStateLayout: LinearLayout
    private lateinit var adapter: DashboardAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_parent_dashboard, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val toolbar = view.findViewById<Toolbar>(R.id.dashboardToolbar)
        toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }

        rvEvents = view.findViewById(R.id.rvEvents)
        emptyStateLayout = view.findViewById(R.id.emptyStateLayout)

        adapter = DashboardAdapter()
        rvEvents.layoutManager = LinearLayoutManager(context)
        rvEvents.adapter = adapter

        viewModel.nudgeEvents.observe(viewLifecycleOwner) { events ->
            if (events == null || events.isEmpty()) {
                emptyStateLayout.visibility = View.VISIBLE
                rvEvents.visibility = View.GONE
            } else {
                emptyStateLayout.visibility = View.GONE
                rvEvents.visibility = View.VISIBLE
                adapter.submitList(events)
            }
        }
    }
}
