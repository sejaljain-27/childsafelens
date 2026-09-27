package com.childsafelens.demo

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Single Activity hosting the Jetpack Navigation component fragments.
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
    }
}
