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

class LoginFragment : Fragment() {

    private val viewModel: AuthViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Auto-redirect if parent session is already active
        viewModel.checkSession { isLoggedIn, hasChild, error ->
            if (error != null) {
                Toast.makeText(context, error, Toast.LENGTH_LONG).show()
                return@checkSession
            }
            if (isLoggedIn) {
                if (hasChild) {
                    findNavController().navigate(R.id.action_loginFragment_to_chatFragment)
                } else {
                    findNavController().navigate(R.id.action_loginFragment_to_addChildFragment)
                }
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_login, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val etEmail = view.findViewById<TextInputEditText>(R.id.etEmail)
        val etPassword = view.findViewById<TextInputEditText>(R.id.etPassword)
        val btnLogin = view.findViewById<Button>(R.id.btnLogin)
        val tvSignupLink = view.findViewById<TextView>(R.id.tvSignupLink)

        btnLogin.setOnClickListener {
            val email = etEmail.text.toString().trim()
            val password = etPassword.text.toString().trim()

            viewModel.login(email, password) { success, error ->
                if (success) {
                    viewModel.checkSession { _, hasChild, sessionError ->
                        if (sessionError != null) {
                            Toast.makeText(context, sessionError, Toast.LENGTH_LONG).show()
                            return@checkSession
                        }
                        if (hasChild) {
                            findNavController().navigate(R.id.action_loginFragment_to_chatFragment)
                        } else {
                            findNavController().navigate(R.id.action_loginFragment_to_addChildFragment)
                        }
                    }
                } else {
                    Toast.makeText(context, error ?: "Login failed", Toast.LENGTH_SHORT).show()
                }
            }
        }

        tvSignupLink.setOnClickListener {
            findNavController().navigate(R.id.action_loginFragment_to_signupFragment)
        }
    }
}
