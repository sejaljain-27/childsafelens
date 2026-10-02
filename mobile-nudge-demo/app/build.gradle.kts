plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.childsafelens.demo"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.childsafelens.demo"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1-demo"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")

    // --- Person B: uncomment when wiring the real on-device model ---
    // implementation("com.microsoft.onnxruntime:onnxruntime-android:1.17.0")

    // --- Person C: uncomment when wiring real Room-based event storage ---
    // implementation("androidx.room:room-runtime:2.6.1")
    // implementation("androidx.room:room-ktx:2.6.1")
    // kapt("androidx.room:room-compiler:2.6.1")
}
