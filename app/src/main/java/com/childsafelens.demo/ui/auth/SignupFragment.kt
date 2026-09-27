package com.childsafelens.demo.ui.auth

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.childsafelens.demo.R
import com.google.android.material.textfield.TextInputEditText
import com.childsafelens.demo.ui.viewmodel.AuthViewModel

class SignupFragment : Fragment() {

    private val viewModel: AuthViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_signup, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val etEmail = view.findViewById<TextInputEditText>(R.id.etEmail)
        val etPassword = view.findViewById<TextInputEditText>(R.id.etPassword)
        val etConfirmPassword = view.findViewById<TextInputEditText>(R.id.etConfirmPassword)
        val btnSignup = view.findViewById<Button>(R.id.btnSignup)
        val tvLoginLink = view.findViewById<TextView>(R.id.tvLoginLink)

        btnSignup.setOnClickListener {
            val email = etEmail.text.toString().trim()
            val password = etPassword.text.toString().trim()
            val confirmPassword = etConfirmPassword.text.toString().trim()

            if (password != confirmPassword) {
                Toast.makeText(context, "Passwords do not match", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            viewModel.signup(email, password) { success, error ->
                if (success) {
                    Toast.makeText(context, "Account created successfully", Toast.LENGTH_SHORT).show()
                    findNavController().navigate(R.id.action_signupFragment_to_addChildFragment)
                } else {
                    Toast.makeText(context, error ?: "Registration failed", Toast.LENGTH_SHORT).show()
                }
            }
        }

        tvLoginLink.setOnClickListener {
            findNavController().navigateUp()
        }
    }
}
