// League members. The `slug` is the member's stable ID: articles reference it via
// `author_slug`, so never rename one. Keep the array in alphabetical slug order.
export type Member = {
  slug: string
  name: string
  avatar?: string
  email?: string
  twitter?: string
  linkedin?: string
  github?: string
}

export const members: Member[] = [
  { slug: 'alvin', name: 'Alvin Bao', avatar: '/static/images/players/alvin.jpg' },
  { slug: 'amogh', name: 'Amogh Natu', avatar: '/static/images/players/amogh.jpg' },
  { slug: 'ankith', name: 'Ankith Kodali', avatar: '/static/images/players/ankith.jpeg' },
  { slug: 'carter', name: 'Carter Bilbro', avatar: '/static/images/players/carter.jpg' },
  { slug: 'joseph', name: 'Joseph Hong', avatar: '/static/images/players/joseph.jpg' },
  { slug: 'keshav', name: 'Keshav Sridhar', avatar: '/static/images/players/keshav.png' },
  { slug: 'kirk', name: 'Kirk Broadbelt', avatar: '/static/images/players/kirk.jpeg' },
  {
    slug: 'revanth',
    name: 'Revanth Bobba',
    avatar: '/static/images/players/revanth.png',
    email: 'slinkybinky99@gmail.com',
    twitter: 'https://twitter.com/Revanth_Bobba',
    linkedin: 'https://www.linkedin.com/in/revanth-bobba-736367184/',
    github: 'https://github.com/revanthbobba1',
  },
  { slug: 'rishi', name: 'Rishi Nookala', avatar: '/static/images/players/rishi_nookala.jpg' },
  { slug: 'sam', name: 'Sam Nangali', avatar: '/static/images/players/sam.jpg' },
  { slug: 'sparsh', name: 'Sparsh Patel', avatar: '/static/images/players/more_mickey.jpg' },
  { slug: 'tj', name: 'TJ Nanugonda', avatar: '/static/images/players/tj.jpg' },
]
