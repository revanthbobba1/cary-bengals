-- One-time backfill of the 11 entries that lived in data/projectsData.ts into press_conferences
-- (049). That file and app/conferences/page.tsx's read of it are removed in the same PR as this
-- migration -- see 029_backfill_articles.sql for the precedent this follows.
--
-- season_year/week_number are parsed from each title. The 4 entries with no year prefix
-- ("Cary Bengals Week 1-4 Press Conference") are from the 2023 season, per the user.
--
-- Two quirks are preserved exactly as they were in the source file, not silently fixed here:
--   - The "Week 6" entry's thumbnail is 2025-week-three-press.png (the Week 3 image, reused --
--     presumably a copy/paste slip in the original file). Fixing it would need a real Week 6
--     image, which this migration doesn't have.
--   - The "Week 1" entry's description text says "week two" even though the title says Week 1.
-- Both are cosmetic and pre-existing; a commissioner can correct either via the new admin UI
-- (title/description) or a follow-up migration once a real Week 6 image exists.

INSERT INTO public.press_conferences
  (season_year, week_number, title, description, youtube_url, thumbnail_url)
VALUES
  (2025, 11, '2025 - Cary Bengals Week 11 Press Conference',
   'Week 11 Cary Bengals press conference, a special guest joins the show to give his thoughts on the home stretch of the season.',
   'https://www.youtube.com/watch?v=YH_ngXTYinY',
   '/static/images/thumbnails/2025-week-eleven-press.jpg'),

  (2025, 10, '2025 - Cary Bengals Week 10 Press Conference',
   'Tune into the Cary Bengals week ten press conference. The season is heating up! Teams are facing must-win scenarios, and the playoff picture is starting to take shape.',
   'https://www.youtube.com/watch?v=DgClD4cZgFs',
   '/static/images/thumbnails/2025-week-ten-press.jpg'),

  (2025, 9, '2025 - Cary Bengals Week 9 Press Conference',
   'Week 9 Cary Bengals press conference, with fan favorites discussing the state of the league.',
   'https://www.youtube.com/watch?v=y18O6JAoaiw',
   '/static/images/thumbnails/2025-week-nine-press.jpg'),

  (2025, 8, '2025 - Cary Bengals Week 8 Press Conference',
   'Listen to the Cary Bengals week eight press conference, where we unveil our new website and the midseason playoff picture.',
   'https://www.youtube.com/watch?v=RG8iLvUP-70',
   '/static/images/thumbnails/2025-week-eight-press.jpg'),

  (2025, 7, '2025 - Cary Bengals Week 7 Press Conference',
   'Listen to the Cary Bengals week seven press conference, with a special guest with spicy takes going into the middle of the fantasy football season.',
   'https://www.youtube.com/watch?v=iy1mO9EK25k',
   '/static/images/thumbnails/2025-week-seven-press.jpg'),

  (2025, 6, '2025 - Cary Bengals Week 6 Press Conference',
   'Cary Bengals is out with their press conference after week 6, tune in for some hot takes and analysis from around the league!',
   'https://www.youtube.com/watch?v=CWIN8oBV2og',
   '/static/images/thumbnails/2025-week-three-press.png'),

  (2025, 3, '2025 - Cary Bengals Week 3 Press Conference',
   'Listen to the Cary Bengals week three press conference featuring various members of the league, as they recap the first month of NFL football, dicuss current standings, and preview week four matchups.',
   'https://www.youtube.com/watch?v=GoCuumaFPBs',
   '/static/images/thumbnails/2025-week-three-press.png'),

  (2023, 4, 'Cary Bengals Week 4 Press Conference',
   'Cary Bengals week four press conference featuring Team ETENRAL PAIN''s GM Amogh Natu, Certified Boys Lover GM Joseph Hong, Great Waller China''s GM Alvin Bao, Hammy Heroes GM Sparsh Patel, and a spedcial interview from LA Akers GM Rishi Nookala.',
   'https://youtu.be/RjeOb-S3xX0?si=_71DY-NszkRVShya',
   '/static/images/thumbnails/week-four-press.jpg'),

  (2023, 3, 'Cary Bengals Week 3 Press Conference',
   'Cary Bengals week three press conference featuring Team Drake and Travis GM Keshav Sridhar, Olave Garden GM Revanth Bobba, Chubbin and Grubbin'' GM Kirk Broadbelt, Meet The Stevenson''s GM TJ Nanugonda, and LA Akers GM Rishi Nookala.',
   'https://youtu.be/Y6mEg2kepBw?si=Km5ro6Uo4wU2i6ZZ',
   '/static/images/thumbnails/week-three-press.jpg'),

  (2023, 2, 'Cary Bengals Week 2 Press Conference',
   'Cary Bengals week two press conference featuring the trophy presentation for Cookin'' It Up GM Sparsh Patel and interviews from Team ETERNAL PAIN GM Amogh Natu, Team Drako GM Carter Bilbro, and Disney Pixar Baddies GM Sam Nangali.',
   'https://youtu.be/eh3mAfQpIJc?si=bh7LrEL95pzPb3z4',
   '/static/images/players/mickey.png'),

  (2023, 1, 'Cary Bengals Week 1 Press Conference',
   'Cary Bengals week two press conference featuring Meet the Stevenson''s GM TJ Nanugonda, Code Monkey''s GM Ankith Kodali, and Disney Pixar Baddies GM Sam Nangali.',
   'https://youtu.be/g2sH8AYwwZw?si=1OHZB9q4jZhwwM2q',
   '/static/images/players/more_mickey.jpg');
