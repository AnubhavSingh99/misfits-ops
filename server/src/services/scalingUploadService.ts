import { hybridDataLayer } from './hybridDataLayer';
import { logger } from '../utils/logger';

interface ClubToCreate {
  club_name: string;
  activity: string;
  city: string;
  area: string;
  current_state: string;
  target_revenue: string;
  target_launch_date: string;
  poc_assigned: string;
  leader_name?: string;
  venue_status?: string;
  notes?: string;
}

interface UploadResults {
  total: number;
  created: string[];
  failed: Array<{ club: string; error: string }>;
}

export class ScalingUploadService {

  /**
   * Process bulk club creation from CSV upload
   * Saves to Firebase (not Misfits DB)
   * NO AUTO TASK GENERATION
   */
  async processBulkClubCreation(clubs: ClubToCreate[]): Promise<UploadResults> {
    const results: UploadResults = {
      total: clubs.length,
      created: [],
      failed: []
    };

    logger.info(`Processing bulk upload of ${clubs.length} clubs`);

    for (const clubData of clubs) {
      try {
        // Create club in Firebase
        const newClub = await this.createClubInFirebase(clubData);
        results.created.push(newClub.name);

        // If POC assigned, save assignment
        if (clubData.poc_assigned) {
          await hybridDataLayer.savePOCAssignment(
            newClub.id,
            clubData.poc_assigned,
            'bulk_upload'
          );
        }

        logger.info(`Created club: ${clubData.club_name}`);

      } catch (error) {
        logger.error(`Failed to create club ${clubData.club_name}:`, error);
        results.failed.push({
          club: clubData.club_name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info(`Bulk upload completed: ${results.created.length} created, ${results.failed.length} failed`);
    return results;
  }

  /**
   * Create club in Firebase (operations database)
   */
  private async createClubInFirebase(clubData: ClubToCreate) {
    const club = {
      id: `club_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: clubData.club_name,
      activity: clubData.activity,
      city: clubData.city,
      area: clubData.area,
      currentState: clubData.current_state || 'not_picked',
      healthStatus: 'green' as const, // New clubs start as green
      revenueType: 'scaling',
      plannedRevenue: parseInt(clubData.target_revenue) || 0,
      targetLaunch: new Date(clubData.target_launch_date),
      createdAt: new Date(),
      updatedAt: new Date(),
      source: 'bulk_upload',
      notes: clubData.notes || '',
      leaderName: clubData.leader_name || null,
      venueStatus: clubData.venue_status || 'not_started'
    };

    // Save to Firebase
    await hybridDataLayer.saveClubToFirebase(club);

    return club;
  }

  /**
   * Validate CSV data before processing
   */
  validateClubData(clubs: ClubToCreate[]): string[] {
    const errors: string[] = [];

    clubs.forEach((club, index) => {
      const rowNumber = index + 2; // Account for header row

      if (!club.club_name?.trim()) {
        errors.push(`Row ${rowNumber}: Missing club name`);
      }

      if (!club.activity?.trim()) {
        errors.push(`Row ${rowNumber}: Missing activity`);
      }

      if (!club.city?.trim()) {
        errors.push(`Row ${rowNumber}: Missing city`);
      }

      if (!club.area?.trim()) {
        errors.push(`Row ${rowNumber}: Missing area`);
      }

      if (club.target_revenue && isNaN(parseInt(club.target_revenue))) {
        errors.push(`Row ${rowNumber}: Invalid target revenue`);
      }

      if (club.target_launch_date && isNaN(Date.parse(club.target_launch_date))) {
        errors.push(`Row ${rowNumber}: Invalid launch date`);
      }

      // Validate current_state
      const validStates = ['not_picked', 'stage_1', 'stage_2', 'stage_3'];
      if (club.current_state && !validStates.includes(club.current_state)) {
        errors.push(`Row ${rowNumber}: Invalid state. Must be one of: ${validStates.join(', ')}`);
      }
    });

    return errors;
  }

  /**
   * Generate CSV template for download
   */
  generateTemplate(): string {
    return `club_name,activity,city,area,current_state,target_revenue,target_launch_date,poc_assigned,leader_name,venue_status,notes
Mumbai Running #10,Running,Mumbai,Andheri,not_picked,150000,2024-02-01,Rahul,,searching,High demand area
Mumbai Running #11,Running,Mumbai,Bandra,stage_1,150000,2024-02-08,Rahul,Amit Kumar,searching,
Delhi Photography #5,Photography,Delhi,CP,not_picked,100000,2024-02-15,Priya,,,Premium location
Delhi Photography #6,Photography,Delhi,Hauz Khas,stage_2,100000,2024-02-22,Priya,Priya Shah,confirmed,Venue at Community Center
Bangalore Books #3,Books,Bangalore,Koramangala,not_picked,80000,2024-02-01,Amit,,,Tech hub area`;
  }
}

// Add method to hybrid data layer for saving clubs
declare module './hybridDataLayer' {
  interface HybridDataLayer {
    saveClubToFirebase(club: any): Promise<string>;
  }
}

// Export singleton
export const scalingUploadService = new ScalingUploadService();