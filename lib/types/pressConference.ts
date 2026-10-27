// Types for the Supabase-backed press conferences feature.
// Schema: supabase/migrations/049_create_press_conferences.sql

export interface PressConference {
  id: string
  season_year: number
  week_number: number
  title: string
  description: string | null
  youtube_url: string | null
  spotify_url: string | null
  /** Only ever set by the historical backfill (050) -- new rows always leave this null. */
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}
