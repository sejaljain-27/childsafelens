package com.childsafelens.demo.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.childsafelens.demo.data.model.ChildProfile
import com.childsafelens.demo.data.model.IncidentEntity
import com.childsafelens.demo.data.model.NudgeEventEntity
import com.childsafelens.demo.data.model.ParentAccount

@Database(
    entities = [ParentAccount::class, ChildProfile::class, NudgeEventEntity::class, IncidentEntity::class],
    version = 2,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun parentAccountDao(): ParentAccountDao
    abstract fun childProfileDao(): ChildProfileDao
    abstract fun nudgeEventDao(): NudgeEventDao
    abstract fun incidentDao(): IncidentDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "child_safe_lens_db"
                )
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
