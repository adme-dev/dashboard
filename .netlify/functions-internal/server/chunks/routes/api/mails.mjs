import { e as eventHandler } from '../../nitro/nitro.mjs';
import { sub } from 'date-fns';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const mails = [{
  id: 1,
  from: {
    name: "Alex Smith",
    email: "alex.smith@example.com",
    avatar: {
      src: "https://i.pravatar.cc/128?u=1"
    }
  },
  subject: "Meeting Schedule: Q1 Marketing Strategy Review",
  body: `Dear Team,

I hope this email finds you well. Just a quick reminder about our Q1 Marketing Strategy meeting scheduled for tomorrow at 10 AM EST in Conference Room A.

Agenda:
- Q4 Performance Review
- New Campaign Proposals
- Budget Allocation for Q2
- Team Resource Planning

Please come prepared with your department updates. I've attached the preliminary deck for your review.

Best regards,
Alex Smith
Senior Marketing Director
Tel: (555) 123-4567`,
  date: (/* @__PURE__ */ new Date()).toISOString()
}, {
  id: 2,
  unread: true,
  from: {
    name: "Jordan Brown",
    email: "jordan.brown@example.com",
    avatar: {
      src: "https://i.pravatar.cc/128?u=2"
    }
  },
  subject: "RE: Project Phoenix - Sprint 3 Update",
  body: `Hi team,

Quick update on Sprint 3 deliverables:

\u2705 User authentication module completed
\u{1F3D7}\uFE0F Payment integration at 80%
\u23F3 API documentation pending review

Key metrics:
- Code coverage: 94%
- Sprint velocity: 45 points
- Bug resolution rate: 98%

Please review the attached report for detailed analysis. Let's discuss any blockers in tomorrow's stand-up.

Regards,
Jordan

--
Jordan Brown
Lead Developer | Tech Solutions
Mobile: +1 (555) 234-5678`,
  date: sub(/* @__PURE__ */ new Date(), { minutes: 7 }).toISOString()
}, {
  id: 3,
  unread: true,
  from: {
    name: "Taylor Green",
    email: "taylor.green@example.com",
    avatar: {
      src: "https://i.pravatar.cc/128?u=3"
    }
  },
  subject: "Lunch Plans",
  body: `Hi there!

I was wondering if you'd like to grab lunch this Friday? There's this amazing new Mexican restaurant downtown called "La Casa" that I've been wanting to try. They're known for their authentic tacos and house-made guacamole.

Would 12:30 PM work for you? It would be great to catch up and discuss the upcoming team building event while we're there.

Let me know what you think!

Best,
Taylor`,
  date: sub(/* @__PURE__ */ new Date(), { hours: 3 }).toISOString()
}, {
  id: 4,
  from: {
    name: "Morgan White",
    email: "morgan.white@example.com",
    avatar: {
      src: "https://i.pravatar.cc/128?u=4"
    }
  },
  subject: "New Proposal: Project Horizon",
  body: `Hi team,

I've just uploaded the comprehensive proposal for Project Horizon to our shared drive. The document includes:

\u2022 Detailed project objectives and success metrics
\u2022 Resource allocation and team structure
\u2022 Timeline with key milestones
\u2022 Budget breakdown
\u2022 Risk assessment and mitigation strategies

I'm particularly excited about our innovative approach to the user engagement component, which could set a new standard for our industry.

Could you please review and provide feedback by EOD Friday? I'd like to present this to the steering committee next week.

Thanks in advance,

Morgan White
Senior Project Manager
Tel: (555) 234-5678`,
  date: sub(/* @__PURE__ */ new Date(), { days: 1 }).toISOString()
}, {
  id: 5,
  from: {
    name: "Casey Gray",
    email: "casey.gray@example.com"
  },
  subject: "Updated: San Francisco Conference Trip Itinerary",
  body: `Dear [Name],

Please find your confirmed travel itinerary below:

FLIGHT DETAILS:
Outbound: AA 1234
Date: March 15, 2024
DEP: JFK 09:30 AM
ARR: SFO 12:45 PM

HOTEL:
Marriott San Francisco
Check-in: March 15
Check-out: March 18
Confirmation #: MR123456

SCHEDULE:
March 15 - Evening: Welcome Reception (6 PM)
March 16 - Conference Day 1 (9 AM - 5 PM)
March 17 - Conference Day 2 (9 AM - 4 PM)

Please let me know if you need any modifications.

Best regards,
Casey Gray
Travel Coordinator
Office: (555) 345-6789`,
  date: sub(/* @__PURE__ */ new Date(), { days: 1 }).toISOString()
}, {
  id: 6,
  from: {
    name: "Jamie Johnson",
    email: "jamie.johnson@example.com"
  },
  subject: "Q1 2024 Financial Performance Review",
  body: `Dear Leadership Team,

Please find attached our Q1 2024 financial analysis report. Key highlights:

PERFORMANCE METRICS:
\u2022 Revenue: $12.4M (+15% YoY)
\u2022 Operating Expenses: $8.2M (-3% vs. budget)
\u2022 Net Profit Margin: 18.5% (+2.5% vs. Q4 2023)

AREAS OF OPTIMIZATION:
1. Cloud infrastructure costs (+22% over budget)
2. Marketing spend efficiency (-8% ROI vs. target)
3. Office operational costs (+5% vs. forecast)

I've scheduled a detailed review for Thursday at 2 PM EST. Calendar invite to follow.

Best regards,
Jamie Johnson
Chief Financial Officer
Ext: 4567`,
  date: sub(/* @__PURE__ */ new Date(), { days: 2 }).toISOString()
}, {
  id: 7,
  from: {
    name: "Riley Davis",
    email: "riley.davis@example.com",
    avatar: {
      src: "https://i.pravatar.cc/128?u=7"
    }
  },
  subject: "[Mandatory] New DevOps Tools Training Session",
  body: `Hello Development Team,

This is a reminder about next week's mandatory training session on our updated DevOps toolkit.

\u{1F4C5} Date: Tuesday, March 19
\u23F0 Time: 10:00 AM - 12:30 PM EST
\u{1F4CD} Location: Virtual (Zoom link below)

We'll be covering:
\u2022 GitLab CI/CD pipeline improvements
\u2022 Docker container optimization
\u2022 Kubernetes cluster management
\u2022 New monitoring tools integration

Prerequisites:
1. Install Docker Desktop 4.25
2. Update VS Code to latest version
3. Complete pre-training survey (link attached)

Zoom Link: https://zoom.us/j/123456789
Password: DevOps2024

--
Riley Davis
DevOps Lead
Technical Operations
M: (555) 777-8888`,
  date: sub(/* @__PURE__ */ new Date(), { days: 2 }).toISOString()
}, {
  id: 8,
  unread: true,
  from: {
    name: "Kelly Wilson",
    email: "kelly.wilson@example.com",
    avatar: {
      src: "https://i.pravatar.cc/128?u=8"
    }
  },
  subject: "\u{1F389} Happy Birthday!",
  body: `Dear [Name],

On behalf of the entire team, wishing you a fantastic birthday! \u{1F382}

We've organized a small celebration in the break room at 3 PM today. Cake and refreshments will be served!

Your dedication and positive energy make our workplace better every day. Here's to another great year ahead!

Best wishes,
Kelly & The HR Team

P.S. Don't forget to check your email for a special birthday surprise from the company! \u{1F381}

--
Kelly Wilson
HR Director
Human Resources Department
Tel: (555) 999-0000`,
  date: sub(/* @__PURE__ */ new Date(), { days: 2 }).toISOString()
}, {
  id: 9,
  from: {
    name: "Drew Moore",
    email: "drew.moore@example.com"
  },
  subject: "Website Redesign Feedback Request - Phase 2",
  body: `Hi there,

We're entering Phase 2 of our website redesign project and would value your input on the latest iterations.

New Features Implementation:
1. Dynamic product catalog
2. Enhanced search functionality
3. Personalized user dashboard
4. Mobile-responsive navigation

Review Links:
\u2022 Staging Environment: https://staging.example.com
\u2022 Design Specs: [Figma Link]
\u2022 User Flow Documentation: [Confluence Link]

Please provide feedback by EOD Friday. Key areas to focus on:
- User experience
- Navigation flow
- Content hierarchy
- Mobile responsiveness

Your insights will be crucial for our final implementation decisions.

Thanks in advance,
Drew Moore
UX Design Lead
Product Design Team`,
  date: sub(/* @__PURE__ */ new Date(), { days: 5 }).toISOString()
}, {
  id: 10,
  from: {
    name: "Jordan Taylor",
    email: "jordan.taylor@example.com"
  },
  subject: "Corporate Wellness Program - Membership Renewal",
  body: `Dear Valued Member,

Your corporate wellness program membership is due for renewal on April 1st, 2024.

NEW AMENITIES:
\u2728 Expanded yoga studio
\u{1F3CB}\uFE0F State-of-the-art cardio equipment
\u{1F9D8} Meditation room
\u{1F465} Additional group fitness classes

RENEWAL BENEFITS:
\u2022 15% early bird discount
\u2022 3 complimentary personal training sessions
\u2022 Free wellness assessment
\u2022 Access to new mobile app

To schedule a tour or discuss renewal options, please book a time here: [Booking Link]

Stay healthy!

Best regards,
Jordan Taylor
Corporate Wellness Coordinator
Downtown Fitness Center
Tel: (555) 123-7890`,
  date: sub(/* @__PURE__ */ new Date(), { days: 5 }).toISOString()
}, {
  id: 11,
  unread: true,
  from: {
    name: "Morgan Anderson",
    email: "morgan.anderson@example.com"
  },
  subject: "Important: Updates to Your Corporate Insurance Policy",
  body: `Dear [Employee Name],

This email contains important information about changes to your corporate insurance coverage effective April 1, 2024.

KEY UPDATES:
1. Health Insurance
   \u2022 Reduced co-pay for specialist visits ($35 \u2192 $25)
   \u2022 Extended telehealth coverage
   \u2022 New mental health benefits

2. Dental Coverage
   \u2022 Increased annual maximum ($1,500 \u2192 $2,000)
   \u2022 Added orthodontic coverage for dependents

3. Vision Benefits
   \u2022 Enhanced frame allowance
   \u2022 New LASIK discount program

Please review the attached documentation carefully and complete the acknowledgment form by March 25th.

Questions? Join our virtual info session:
\u{1F4C5} March 20th, 2024
\u23F0 11:00 AM EST
\u{1F517} [Teams Link]

Regards,
Morgan Anderson
Benefits Coordinator
HR Department`,
  date: sub(/* @__PURE__ */ new Date(), { days: 12 }).toISOString()
}, {
  id: 12,
  from: {
    name: "Casey Thomas",
    email: "casey.thomas@example.com"
  },
  subject: '\u{1F4DA} March Book Club Meeting: "The Great Gatsby"',
  body: `Hello Book Lovers!

I hope you're enjoying F. Scott Fitzgerald's masterpiece! Our next meeting details:

\u{1F4C5} Thursday, March 21st
\u23F0 5:30 PM - 7:00 PM
\u{1F4CD} Main Conference Room (or Zoom)

Discussion Topics:
1. Symbolism of the green light
2. The American Dream theme
3. Character development
4. Social commentary

Please bring your suggestions for April's book selection!

Refreshments will be provided \u{1F36A}

RSVP by replying to this email.

Happy reading!
Casey

--
Casey Thomas
Book Club Coordinator
Internal Culture Committee`,
  date: sub(/* @__PURE__ */ new Date(), { months: 1 }).toISOString()
}, {
  id: 13,
  from: {
    name: "Jamie Jackson",
    email: "jamie.jackson@example.com"
  },
  subject: "\u{1F373} Company Cookbook Project - Recipe Submission Reminder",
  body: `Dear Colleagues,

Final call for our company cookbook project submissions!

Guidelines for Recipe Submission:
1. Include ingredients list with measurements
2. Step-by-step instructions
3. Cooking time and servings
4. Photo of the finished dish (optional)
5. Any cultural or personal significance

Submission Deadline: March 22nd, 2024

We already have some amazing entries:
\u2022 Sarah's Famous Chili
\u2022 Mike's Mediterranean Pasta
\u2022 Lisa's Vegan Brownies
\u2022 Tom's Family Paella

All proceeds from cookbook sales will support our local food bank.

Submit here: [Form Link]

Cooking together,
Jamie Jackson
Community Engagement Committee
Ext. 5432`,
  date: sub(/* @__PURE__ */ new Date(), { months: 1 }).toISOString()
}, {
  id: 14,
  from: {
    name: "Riley White",
    email: "riley.white@example.com"
  },
  subject: "\u{1F9D8}\u200D\u2640\uFE0F Updated Corporate Wellness Schedule - Spring 2024",
  body: `Dear Wellness Program Participants,

Our Spring 2024 wellness schedule is now available!

NEW CLASSES:
Monday:
\u2022 7:30 AM - Morning Flow Yoga
\u2022 12:15 PM - HIIT Express
\u2022 5:30 PM - Meditation Basics

Wednesday:
\u2022 8:00 AM - Power Vinyasa
\u2022 12:00 PM - Desk Stretching
\u2022 4:30 PM - Mindfulness Workshop

Friday:
\u2022 7:45 AM - Gentle Yoga
\u2022 12:30 PM - Stress Management
\u2022 4:45 PM - Weekend Wind-Down

All classes available in-person and via Zoom.
Download our app to reserve your spot!

Namaste,
Riley White
Corporate Wellness Instructor
Wellness & Benefits Team`,
  date: sub(/* @__PURE__ */ new Date(), { months: 1 }).toISOString()
}, {
  id: 15,
  from: {
    name: "Kelly Harris",
    email: "kelly.harris@example.com"
  },
  subject: '\u{1F4DA} Book Launch Event: "Digital Transformation in the Modern Age"',
  body: `Dear [Name],

You're cordially invited to the launch of my new book, "Digital Transformation in the Modern Age: A Leadership Guide"

EVENT DETAILS:
\u{1F4C5} Date: April 15th, 2024
\u23F0 Time: 6:00 PM - 8:30 PM EST
\u{1F4CD} Grand Hotel Downtown
   123 Business Ave.

AGENDA:
6:00 PM - Welcome Reception
6:30 PM - Keynote Presentation
7:15 PM - Q&A Session
7:45 PM - Book Signing
8:00 PM - Networking

Light refreshments will be served.
Each attendee will receive a signed copy of the book.

RSVP by April 1st: [Event Link]

Looking forward to sharing this milestone with you!

Best regards,
Kelly Harris
Digital Strategy Consultant
Author, "Digital Transformation in the Modern Age"`,
  date: sub(/* @__PURE__ */ new Date(), { months: 1 }).toISOString()
}, {
  id: 16,
  from: {
    name: "Drew Martin",
    email: "drew.martin@example.com"
  },
  subject: "\u{1F680} TechCon 2024: Early Bird Registration Now Open",
  body: `Dear Tech Enthusiasts,

Registration is now open for TechCon 2024: "Innovation at Scale"

CONFERENCE HIGHLIGHTS:
\u{1F4C5} May 15-17, 2024
\u{1F4CD} Tech Convention Center

KEYNOTE SPEAKERS:
\u2022 Sarah Johnson - CEO, Future Tech Inc.
\u2022 Dr. Michael Chang - AI Research Director
\u2022 Lisa Rodriguez - Cybersecurity Expert

TRACKS:
1. AI/ML Innovation
2. Cloud Architecture
3. DevSecOps
4. Digital Transformation
5. Emerging Technologies

EARLY BIRD PRICING (ends April 1):
Full Conference Pass: $899 (reg. $1,199)
Team Discount (5+): 15% off

Register here: [Registration Link]

Best regards,
Drew Martin
Conference Director
TechCon 2024`,
  date: sub(/* @__PURE__ */ new Date(), { months: 1, days: 4 }).toISOString()
}, {
  id: 17,
  from: {
    name: "Alex Thompson",
    email: "alex.thompson@example.com"
  },
  subject: "\u{1F3A8} Modern Perspectives: Contemporary Art Exhibition",
  body: `Hi there,

Hope you're well! I wanted to personally invite you to an extraordinary art exhibition this weekend.

"Modern Perspectives: Breaking Boundaries"
\u{1F4C5} Saturday & Sunday
\u23F0 10 AM - 6 PM
\u{1F4CD} Metropolitan Art Gallery

FEATURED ARTISTS:
\u2022 Maria Chen - Mixed Media
\u2022 James Wright - Digital Art
\u2022 Sofia Patel - Installation
\u2022 Robert Kim - Photography

SPECIAL EVENTS:
\u2022 Artist Talk: Saturday, 2 PM
\u2022 Workshop: Sunday, 11 AM
\u2022 Wine Reception: Saturday, 5 PM

Would love to meet you there! Let me know if you'd like to go together.

Best,
Alex Thompson
Curator
Metropolitan Art Gallery
Tel: (555) 234-5678`,
  date: sub(/* @__PURE__ */ new Date(), { months: 1, days: 15 }).toISOString()
}, {
  id: 18,
  from: {
    name: "Jordan Garcia",
    email: "jordan.garcia@example.com"
  },
  subject: '\u{1F91D} Industry Networking Event: "Connect & Innovate 2024"',
  body: `Dear Professional Network,

You're invited to our premier networking event!

EVENT DETAILS:
\u{1F4C5} March 28th, 2024
\u23F0 6:00 PM - 9:00 PM
\u{1F4CD} Innovation Hub
   456 Enterprise Street

SPEAKERS:
\u2022 Mark Thompson - "Future of Work"
\u2022 Dr. Sarah Chen - "Innovation Trends"
\u2022 Robert Mills - "Digital Leadership"

SCHEDULE:
6:00 - Registration & Welcome
6:30 - Keynote Presentations
7:30 - Networking Session
8:30 - Panel Discussion

Complimentary hors d'oeuvres and beverages will be served.

RSVP Required: [Registration Link]

Best regards,
Jordan Garcia
Event Coordinator
Professional Networking Association`,
  date: sub(/* @__PURE__ */ new Date(), { months: 1, days: 18 }).toISOString()
}, {
  id: 19,
  from: {
    name: "Taylor Rodriguez",
    email: "taylor.rodriguez@example.com"
  },
  subject: "\u{1F31F} Community Service Day - Volunteer Opportunities",
  body: `Dear Colleagues,

Join us for our annual Community Service Day!

EVENT DETAILS:
\u{1F4C5} Saturday, April 6th, 2024
\u23F0 9:00 AM - 3:00 PM
\u{1F4CD} Multiple Locations

VOLUNTEER OPPORTUNITIES:
1. City Park Cleanup
   \u2022 Garden maintenance
   \u2022 Trail restoration
   \u2022 Playground repair

2. Food Bank
   \u2022 Sorting donations
   \u2022 Packing meals
   \u2022 Distribution

3. Animal Shelter
   \u2022 Dog walking
   \u2022 Facility cleaning
   \u2022 Social media support

All volunteers receive:
\u2022 Company volunteer t-shirt
\u2022 Lunch and refreshments
\u2022 Certificate of participation
\u2022 8 hours community service credit

Sign up here: [Volunteer Portal]

Making a difference together,
Taylor Rodriguez
Community Outreach Coordinator
Corporate Social Responsibility Team`,
  date: sub(/* @__PURE__ */ new Date(), { months: 1, days: 25 }).toISOString()
}, {
  id: 20,
  from: {
    name: "Morgan Lopez",
    email: "morgan.lopez@example.com"
  },
  subject: "\u{1F697} Vehicle Maintenance Reminder: 30,000 Mile Service",
  body: `Dear Valued Customer,

Your vehicle is due for its 30,000-mile maintenance service.

RECOMMENDED SERVICES:
\u2022 Oil and filter change
\u2022 Tire rotation and alignment
\u2022 Brake system inspection
\u2022 Multi-point safety inspection
\u2022 Fluid level check and top-off
\u2022 Battery performance test

SERVICE CENTER DETAILS:
\u{1F4CD} Downtown Auto Care
   789 Service Road

\u260E\uFE0F (555) 987-6543

Available Appointments:
\u2022 Monday-Friday: 7:30 AM - 6:00 PM
\u2022 Saturday: 8:00 AM - 2:00 PM

Schedule online: [Booking Link]
or call our service desk directly.

Drive safely,
Morgan Lopez
Service Coordinator
Downtown Auto Care
Emergency: (555) 987-6544`,
  date: sub(/* @__PURE__ */ new Date(), { months: 2 }).toISOString()
}];
const mails$1 = eventHandler(async () => {
  return mails;
});

export { mails$1 as default };
//# sourceMappingURL=mails.mjs.map
