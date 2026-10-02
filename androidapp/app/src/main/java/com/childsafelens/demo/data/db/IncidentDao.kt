package com.childsafelens.demo.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.childsafelens.demo.data.model.IncidentEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface IncidentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(incident: IncidentEntity)

    @Query("SELECT * FROM incidents WHERE incidentId = :incidentId LIMIT 1")
    suspend fun getIncident(incidentId: String): IncidentEntity?

    @Query("SELECT * FROM incidents WHERE status = 'PENDING'")
    suspend fun getPendingIncidents(): List<IncidentEntity>

    @Query("SELECT * FROM incidents ORDER BY timestamp DESC")
    fun getAllIncidentsFlow(): Flow<List<IncidentEntity>>
}
