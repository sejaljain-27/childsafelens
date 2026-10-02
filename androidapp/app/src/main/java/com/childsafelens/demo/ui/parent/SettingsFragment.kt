package com.childsafelens.demo.ui.parent

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.widget.Toolbar
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.childsafelens.demo.R
import com.childsafelens.demo.ui.viewmodel.AuthViewModel

class SettingsFragment : Fragment() {

    private val viewModel: AuthViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_settings, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val toolbar = view.findViewById<Toolbar>(R.id.settingsToolbar)
        toolbar.setNavigationOnClickListener {
            findNavController().navigateUp()
        }

        view.findViewById<Button>(R.id.btnViewDashboard).setOnClickListener {
            findNavController().navigate(R.id.action_settingsFragment_to_parentDashboardFragment)
        }

        view.findViewById<Button>(R.id.btnEnableService).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }

        view.findViewById<Button>(R.id.btnGrantOverlay).setOnClickListener {
            val context = requireContext()
            if (!Settings.canDrawOverlays(context)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                )
                startActivity(intent)
            } else {
                Toast.makeText(context, "Overlay permission already granted", Toast.LENGTH_SHORT).show()
            }
        }

        view.findViewById<Button>(R.id.btnLogout).setOnClickListener {
            viewModel.sessionManager.logout()
            Toast.makeText(context, "Logged out", Toast.LENGTH_SHORT).show()
            findNavController().navigate(R.id.action_settingsFragment_to_loginFragment)
        }
    }
}
