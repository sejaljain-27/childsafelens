package com.childsafelens.demo.ui.auth

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

class AddChildFragment : Fragment() {

    private val viewModel: AuthViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_add_child, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val etChildName = view.findViewById<TextInputEditText>(R.id.etChildName)
        val btnCreateProfile = view.findViewById<Button>(R.id.btnCreateProfile)

        btnCreateProfile.setOnClickListener {
            val childName = etChildName.text.toString().trim()
            if (childName.isEmpty()) {
                Toast.makeText(context, "Please enter a display name", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            viewModel.addChildProfile(childName) { success, error ->
                if (success) {
                    Toast.makeText(context, "Child profile created!", Toast.LENGTH_SHORT).show()
                    findNavController().navigate(R.id.action_addChildFragment_to_chatFragment)
                } else {
                    Toast.makeText(context, error ?: "Failed to create profile", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
