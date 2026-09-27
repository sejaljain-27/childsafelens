package com.childsafelens.demo.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.childsafelens.demo.data.model.ChildProfile
import com.childsafelens.demo.data.model.NudgeEventEntity
import com.childsafelens.demo.data.model.ParentAccount
import kotlinx.coroutines.flow.Flow

@Dao
interface ParentAccountDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(account: ParentAccount)

    @Query("SELECT * FROM parent_accounts WHERE email = :email LIMIT 1")
    suspend fun getParentAccount(email: String): ParentAccount?
}

@Dao
interface ChildProfileDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(profile: ChildProfile)

    @Query("SELECT * FROM child_profiles WHERE parentEmail = :parentEmail")
    suspend fun getChildProfilesForParent(parentEmail: String): List<ChildProfile>
}

@Dao
interface NudgeEventDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: NudgeEventEntity)

    @Query("SELECT * FROM nudge_events ORDER BY timestamp DESC")
    fun getAllEventsFlow(): Flow<List<NudgeEventEntity>>

    @Query("SELECT * FROM nudge_events ORDER BY timestamp DESC")
    suspend fun getAllEvents(): List<NudgeEventEntity>
}
