package com.childsafelens.demo.ui.parent

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.childsafelens.demo.R
import com.google.android.material.textfield.TextInputEditText
import com.childsafelens.demo.ui.viewmodel.AuthViewModel

class ReAuthFragment : Fragment() {

    private val viewModel: AuthViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_re_auth, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val etPassword = view.findViewById<TextInputEditText>(R.id.etReAuthPassword)
        val btnVerify = view.findViewById<Button>(R.id.btnVerify)
        val btnCancel = view.findViewById<Button>(R.id.btnCancelReAuth)

        btnVerify.setOnClickListener {
            val password = etPassword.text.toString().trim()
            if (password.isEmpty()) {
                Toast.makeText(context, "Password cannot be empty", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            viewModel.verifyPassword(password) { success ->
                if (success) {
                    findNavController().navigate(R.id.action_reAuthFragment_to_settingsFragment)
                } else {
                    Toast.makeText(context, "Invalid parent password", Toast.LENGTH_SHORT).show()
                }
            }
        }

        btnCancel.setOnClickListener {
            findNavController().navigateUp()
        }
    }
}
