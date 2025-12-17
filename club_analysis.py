#!/usr/bin/env python3
"""
Misfits Club Analysis Script
Generates club data with L1/L2 classification by area and city
"""

import psycopg2
import pandas as pd
import sys
from datetime import datetime, timedelta

# Database connection parameters
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'misfits',
    'user': 'dev',
    'password': 'postgres'
}

def connect_db():
    """Establish database connection"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except psycopg2.Error as e:
        print(f"Database connection failed: {e}")
        sys.exit(1)

def get_club_data_with_location():
    """
    Get club data with L1/L2 classification, including area and city information
    """
    query = """
    SELECT
        c.pk as club_id,
        c.name as club_name,
        c.activity,
        c.area,
        c.city,
        c.state,
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT DATE_TRUNC('week', e.created_at)) as active_weeks,
        CASE
            WHEN COUNT(DISTINCT e.id) / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', e.created_at)), 0) >= 2 THEN 'L2'
            WHEN COUNT(DISTINCT e.id) / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', e.created_at)), 0) >= 1 THEN 'L1'
            ELSE 'Inactive'
        END as club_level,
        COUNT(DISTINCT e.id) / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', e.created_at)), 0) as events_per_week
    FROM club c
    LEFT JOIN event e ON c.pk = e.club_id
    WHERE c.status = 'ACTIVE'
        AND (e.created_at >= CURRENT_DATE - INTERVAL '90 days' OR e.created_at IS NULL)
    GROUP BY c.pk, c.name, c.activity, c.area, c.city, c.state
    ORDER BY c.area, c.city, club_level DESC, c.name;
    """

    conn = connect_db()
    try:
        df = pd.read_sql_query(query, conn)
        return df
    finally:
        conn.close()

def get_club_growth_data():
    """
    Get club growth data for comparison periods
    """
    query = """
    WITH club_periods AS (
        SELECT
            c.pk as club_id,
            c.name as club_name,
            c.area,
            c.city,
            -- Current period (last 30 days)
            COUNT(DISTINCT CASE
                WHEN e.created_at >= CURRENT_DATE - INTERVAL '30 days'
                THEN e.id
            END) as events_last_30,
            COUNT(DISTINCT CASE
                WHEN e.created_at >= CURRENT_DATE - INTERVAL '30 days'
                THEN DATE_TRUNC('week', e.created_at)
            END) as weeks_last_30,

            -- Previous period (31-60 days ago)
            COUNT(DISTINCT CASE
                WHEN e.created_at >= CURRENT_DATE - INTERVAL '60 days'
                AND e.created_at < CURRENT_DATE - INTERVAL '30 days'
                THEN e.id
            END) as events_prev_30,
            COUNT(DISTINCT CASE
                WHEN e.created_at >= CURRENT_DATE - INTERVAL '60 days'
                AND e.created_at < CURRENT_DATE - INTERVAL '30 days'
                THEN DATE_TRUNC('week', e.created_at)
            END) as weeks_prev_30
        FROM club c
        LEFT JOIN event e ON c.pk = e.club_id
        WHERE c.status = 'ACTIVE'
            AND (e.created_at >= CURRENT_DATE - INTERVAL '60 days' OR e.created_at IS NULL)
        GROUP BY c.pk, c.name, c.area, c.city
    )
    SELECT
        *,
        CASE
            WHEN events_last_30 > events_prev_30 THEN 'Growing'
            WHEN events_last_30 = events_prev_30 THEN 'Stable'
            WHEN events_last_30 < events_prev_30 THEN 'Declining'
            ELSE 'New'
        END as growth_status,
        events_last_30 - events_prev_30 as event_growth,
        CASE
            WHEN events_prev_30 > 0
            THEN ROUND(((events_last_30 - events_prev_30)::decimal / events_prev_30 * 100), 2)
            ELSE NULL
        END as growth_percentage
    FROM club_periods
    ORDER BY area, city, events_last_30 DESC;
    """

    conn = connect_db()
    try:
        df = pd.read_sql_query(query, conn)
        return df
    finally:
        conn.close()

def create_area_city_summary():
    """
    Create OND-style mapping with area/city aggregated data
    """
    # Get club data
    club_data = get_club_data_with_location()
    growth_data = get_club_growth_data()

    # Merge club classification with growth data
    merged_data = pd.merge(
        club_data[['club_id', 'club_name', 'area', 'city', 'club_level']],
        growth_data[['club_id', 'growth_status', 'event_growth', 'growth_percentage']],
        on='club_id',
        how='left'
    )

    # Create area/city summary
    summary = merged_data.groupby(['area', 'city']).agg({
        'club_level': lambda x: pd.Series(x).value_counts().to_dict(),
        'growth_status': lambda x: pd.Series(x).value_counts().to_dict(),
        'event_growth': ['sum', 'mean'],
        'club_id': 'count'
    }).reset_index()

    # Flatten the summary data
    area_city_summary = []

    for _, row in summary.iterrows():
        area = row['area']
        city = row['city']

        # Count clubs by level
        club_levels = row[('club_level', '<lambda>')]
        l1_count = club_levels.get('L1', 0)
        l2_count = club_levels.get('L2', 0)
        inactive_count = club_levels.get('Inactive', 0)
        total_clubs = row[('club_id', 'count')]

        # Growth metrics
        growth_statuses = row[('growth_status', '<lambda>')]
        growing_count = growth_statuses.get('Growing', 0)
        declining_count = growth_statuses.get('Declining', 0)
        stable_count = growth_statuses.get('Stable', 0)

        total_event_growth = row[('event_growth', 'sum')]
        avg_event_growth = row[('event_growth', 'mean')]

        area_city_summary.append({
            'Area': area if pd.notna(area) else 'Unknown',
            'City': city if pd.notna(city) else 'Unknown',
            'Total_Clubs': total_clubs,
            'L1_Clubs': l1_count,
            'L2_Clubs': l2_count,
            'Inactive_Clubs': inactive_count,
            'Growing_Clubs': growing_count,
            'Declining_Clubs': declining_count,
            'Stable_Clubs': stable_count,
            'Total_Event_Growth': total_event_growth if pd.notna(total_event_growth) else 0,
            'Avg_Event_Growth': round(avg_event_growth, 2) if pd.notna(avg_event_growth) else 0,
            'Activity_Rate': round((l1_count + l2_count) / total_clubs * 100, 1) if total_clubs > 0 else 0
        })

    return pd.DataFrame(area_city_summary)

def main():
    print("Connecting to Misfits database...")

    try:
        # Generate club data with L1/L2 classification
        print("Fetching club data with L1/L2 classification...")
        club_data = get_club_data_with_location()

        # Generate growth data
        print("Fetching club growth data...")
        growth_data = get_club_growth_data()

        # Create area/city summary (OND-style)
        print("Creating area/city summary...")
        area_summary = create_area_city_summary()

        # Save to CSV files
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")

        club_data.to_csv(f'club_data_detailed_{timestamp}.csv', index=False)
        growth_data.to_csv(f'club_growth_data_{timestamp}.csv', index=False)
        area_summary.to_csv(f'area_city_summary_{timestamp}.csv', index=False)

        print(f"Files generated:")
        print(f"- club_data_detailed_{timestamp}.csv")
        print(f"- club_growth_data_{timestamp}.csv")
        print(f"- area_city_summary_{timestamp}.csv")

        # Display summary
        print("\nArea/City Summary (OND-style):")
        print(area_summary.to_string(index=False))

        print(f"\nTotal areas: {area_summary['Area'].nunique()}")
        print(f"Total cities: {len(area_summary)}")
        print(f"Total L1 clubs: {area_summary['L1_Clubs'].sum()}")
        print(f"Total L2 clubs: {area_summary['L2_Clubs'].sum()}")
        print(f"Total active clubs: {area_summary['L1_Clubs'].sum() + area_summary['L2_Clubs'].sum()}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()