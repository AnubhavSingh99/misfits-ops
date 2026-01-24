# Claude Database Access Instructions

## Database Connection Setup

The application uses **on-demand SSH tunnels** that are automatically established when needed. No manual SSH tunnel setup is required.

### Development Setup

1. Ensure the SSH key is available at: `~/Downloads/DB claude key/claude-control-key`
2. Set correct key permissions: `chmod 600 "~/Downloads/DB claude key/claude-control-key"`
3. Start the server with `npm run dev` - SSH tunnels will be created automatically as needed

### Database Connection Details

The system automatically connects to:
- **Database:** misfits (production)
- **Host:** misfits.cgncbvolnhe7.ap-south-1.rds.amazonaws.com
- **User:** dev
- **Password:** postgres

### Common Database Queries

#### Get Monthly Revenue (Completed Payments)
```sql
SELECT
  DATE_TRUNC('month', p.created_at) as month,
  SUM(p.amount)/100 as total_revenue_rupees
FROM payment p
JOIN booking b ON p.booking_id = b.pk
JOIN event e ON b.event_id = e.pk
JOIN club c ON e.club_id = c.pk
WHERE p.status = 'COMPLETED'
AND p.created_at >= '2025-06-01'
AND p.created_at < '2025-10-01'
AND c.status = 'ACTIVE'
GROUP BY DATE_TRUNC('month', p.created_at)
ORDER BY month;
```

#### Get Club L1/L2 Classification
```sql
SELECT
  c.name as club_name,
  c.activity,
  COUNT(DISTINCT e.id) as total_events,
  COUNT(DISTINCT DATE_TRUNC('week', e.created_at)) as active_weeks,
  CASE
    WHEN COUNT(DISTINCT e.id) / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', e.created_at)), 0) >= 2 THEN 'L2'
    WHEN COUNT(DISTINCT e.id) / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', e.created_at)), 0) >= 1 THEN 'L1'
    ELSE 'Inactive'
  END as club_level
FROM club c
LEFT JOIN event e ON c.pk = e.club_id
WHERE c.status = 'ACTIVE'
AND e.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY c.pk, c.name, c.activity
ORDER BY club_level DESC;
```

### Important Notes
- **Database amounts are in PAISA** - divide by 100 to get rupees
- **QR Revenue is NOT in database** - add separately as specified
- **September data needs extrapolation** - only 25 days available
- **SSH tunnels are managed automatically** - no manual intervention required