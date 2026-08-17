-- Insert 2026 season teams (using 2025 team names as placeholders)
INSERT INTO teams (name, owner_name, season_year) VALUES
  ('Tet Offensive (Sparsh)', 'Sparsh', 2026),
  ('Nangali''s `Naners (Sam)', 'Sam', 2026),
  ('Heterophobes Reloaded 😈 (Joseph)', 'Joseph', 2026),
  ('It Hurts a little (Rishi)', 'Rishi', 2026),
  ('Indian DJ (TJ)', 'TJ', 2026),
  ('Bark for Daddy!🫵🐶 (Kirk)', 'Kirk', 2026),
  ('Kamara vs the World (Amogh)', 'Amogh', 2026),
  ('Maye I Digg in yo Boutte (Revanth)', 'Revanth', 2026),
  ('Smooth Jazz w Kenny G (Keshav)', 'Keshav', 2026),
  ('Code Monkey (PR #414) (Ankith)', 'Ankith', 2026),
  ('Jayden Jefferson Jr''s Mom (Carter)', 'Carter', 2026),
  ('Stevenson and White Guys For (Alvin)', 'Alvin', 2026)
ON CONFLICT (name, season_year) DO NOTHING;
