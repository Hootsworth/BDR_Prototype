#!/usr/bin/env python3
"""
Synthetic Data Generator for GTM Console Investor Demo.
Generates:
- 30 Influencers (Influencer #1 is Kim Beluzo, plus 29 B2B / Credit Union / FinTech influencers)
- 30 Referred Contacts per Influencer (900 prospects total -> 930 total contacts)
- 50% of referred contacts per Influencer (15 of 30 = 450 contacts) have scheduled & taken a call
- 70% of referred contacts per Influencer (21 of 30 = 630 contacts) are Enriched with AI dossiers
- 60% of referred contacts per Influencer (18 of 30 = 540 contacts) have Email & LinkedIn outreach sent
- Pre-populated Events (GAC Dinner, SymWest Booth, Executive Meetup, AI FinTech Summit) with event metadata and attendees
"""

import json
import os
import random
import time

INFLUENCER_PROFILES = [
    ("Kim", "Beluzo", "Senior Credit Union Advisory Partner", "Beluzo FinTech Advisory", "kim.beluzo@beluzoadvisory.com", "NY"),
    ("Bob", "Miller", "Managing Partner", "Miller Advisory Group", "bob.miller@milleradvisory.com", "NY"),
    ("Sarah", "Vance", "Principal FinTech Strategist", "Vance Consulting Group", "svance@vanceconsulting.net", "IL"),
    ("Marcus", "Thorne", "Board Member & CU Advisor", "Thorne Banking Partners", "m.thorne@thornepartners.io", "CA"),
    ("Elena", "Rostova", "VP of Ecosystem Partnerships", "CUNA Strategic Alliances", "erostova@cunastrategic.org", "WI"),
    ("David", "Kowalski", "Chief Core Banking Consultant", "Kowalski & Associates", "david@kowalskicore.com", "TX"),
    ("Priya", "Natarajan", "Digital Transformation Lead", "FinServe Catalyst", "priya@finservecatalyst.com", "MA"),
    ("Jonathan", "Mercer", "Executive Director", "Credit Union Tech Council", "jmercer@cutechcouncil.org", "DC"),
    ("Hannah", "Lindqvist", "Founder & Principal", "Nordic-Am FinTech Bridge", "hannah@nafintech.com", "MN"),
    ("Carlos", "Mendoza", "Senior Risk & Compliance Advisor", "Mendoza Regulatory Group", "cmendoza@mendozareg.com", "FL"),
    ("Tanya", "Okafor", "Head of Financial Innovation", "Apex Venture Studio", "tokafor@apexventure.io", "GA"),
    ("Richard", "Sterling", "Former NCUA Examiner & Advisor", "Sterling Governance", "rsterling@sterlinggov.org", "VA"),
    ("Mei-Ling", "Chen", "Partner, Banking AI Practice", "Pacific Rim Advisory", "mlchen@pacificrimadvisory.com", "WA"),
    ("Derek", "Holloway", "SVP Strategic Channel Alliances", "CoreBridge Network", "dholloway@corebridgenet.com", "NC"),
    ("Sophia", "Alvarez", "Founder, CU Growth Collective", "CU Growth Collective", "sophia@cugrowth.co", "CO"),
    ("logan", "MacAllister", "Managing Director", "Highland Financial Partners", "logan@highlandfp.com", "PA"),
    ("Nadia", "Mansour", "Chief Advisory Officer", "Lumina Banking Intelligence", "nmansour@luminabi.com", "MI"),
    ("Victor", "Castellanos", "Principal Consultant", "Southwest Credit Union League", "vcastellanos@swculeague.org", "AZ"),
    ("claire", "beaumont", "Head of Analyst Relations", "FinTech Benchmark Lab", "cbeaumont@fintechbenchmark.io", "NY"),
    ("Gregory", "Stanton", "Executive Advisor", "Stanton Symitar Specialists", "gstanton@stantonsymitar.com", "MO"),
    ("Amara", "Diallo", "Partner, Enterprise Data Strategy", "Diallo & Co.", "amara@diallostrategy.com", "MD"),
    ("Kenneth", "O'Connor", "Senior Fellow", "Institute for Cooperative Finance", "koconnor@icfinance.org", "OH"),
    ("Rachel", "Goldstein", "VP Partner Ecosystem", "NextGen Core Alliance", "rgoldstein@nextgencore.com", "NJ"),
    ("Trevor", "Fitzgerald", "Principal", "Cascadia Credit Union Advisors", "trevor@cascadiacu.com", "OR"),
    ("camille", "Laurent", "Director of FinTech Partnerships", "Laurent Advisory", "camille@laurentadvisory.com", "CA"),
    ("warren", "Takahashi", "CTO-in-Residence", "Aloha Financial Ventures", "wtakahashi@alohafv.com", "HI"),
    ("Beatrice", "Vandenberg", "Managing Partner", "Heartland CU Consultants", "bvandenberg@heartlandcu.org", "IA"),
    ("Julian", "Blackwood", "Head of Institutional Strategy", "Blackwood FinTech", "jblackwood@blackwoodft.com", "CT"),
    ("simone", "Boudreaux", "Senior Partner", "Gulf Coast Banking Advisors", "sboudreaux@gulfcoastba.com", "LA"),
    ("arthur", "Pendleton", "Chairman & Senior Advisor", "Pendleton Financial Group", "apendleton@pendletonfg.com", "TN"),
]

FIRST_NAMES = [
    "Liam", "Olivia", "Noah", "Emma", "Oliver", "Charlotte", "Elijah", "Amelia",
    "James", "Sophia", "William", "Isabella", "Benjamin", "Ava", "Lucas", "Mia",
    "Henry", "Evelyn", "Theodore", "Harper", "Jack", "Luna", "Levi", "Camila",
    "Alexander", "Gianna", "Jackson", "Elizabeth", "Mateo", "Eleanor", "Daniel", "Ella",
    "Michael", "Abigail", "Mason", "Sofia", "Sebastian", "Avery", "Ethan", "Scarlett",
    "Logan", "Emily", "Owen", "Aria", "Samuel", "Penelope", "Jacob", "Chloe",
    "Asher", "Layla", "Aiden", "Mila", "John", "Nora", "Joseph", "Hazel",
    "Wyatt", "Madison", "David", "Ellie", "Leo", "Lily", "Luke", "Nova"
]

LAST_NAMES = [
    "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez",
    "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
    "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen",
    "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera",
    "Campbell", "Mitchell", "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner",
    "Diaz", "Parker", "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris",
    "Morales", "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper",
    "Peterson", "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox"
]

JOB_TITLES = [
    "Chief Information Officer",
    "VP of Digital Transformation",
    "Chief Technology Officer",
    "SVP of Member Experience",
    "Chief Risk & Compliance Officer",
    "VP of IT Operations",
    "Director of Core Banking Systems",
    "Chief Operating Officer",
    "VP of Data & Analytics",
    "SVP of Lending Innovation",
    "Head of Information Security",
    "VP of Enterprise Architecture"
]

CREDIT_UNION_PREFIXES = [
    "Apex", "Summit", "Horizon", "Pinnacle", "First Community", "Pacific Northwest",
    "Golden State", "Heartland", "Liberty", "Heritage", "Beacon", "Vanguard",
    "Cascade", "Redwood", "Blue Ridge", "Sunbelt", "Great Lakes", "Keystone",
    "Frontier", "Silver State", "Emerald", "Granite State", "Prairie", "Lone Star",
    "Atlantic", "Chesapeake", "Mountain View", "Valley", "Metro", "Peninsula"
]

CREDIT_UNION_SUFFIXES = [
    "Federal Credit Union",
    "Community Credit Union",
    "Members Credit Union",
    "Financial Credit Union",
    "Educators Credit Union",
    "Employees Credit Union"
]

STATES = ["NY", "CA", "TX", "FL", "IL", "WA", "MA", "CO", "NC", "GA", "VA", "PA", "OH", "MI", "AZ"]
ASSET_SIZES = ["$500M - $1B", "$1B - $2.5B", "$2.5B - $5B", "$5B - $10B", "$10B+"]

CALL_OUTCOMES_TAKEN = [
    "Spoke to prospect - Interested (Call Taken)",
    "Completed Discovery Briefing - Evaluating LLM Guardrails (Call Taken)",
    "Call Taken - Technical Deep Dive Scheduled with CIO",
    "Call Taken - Approved Security & NCUA Compliance POC",
    "Spoke to prospect - Requested Executive Proposal (Call Taken)"
]


def build_synthetic_dataset(seed=42):
    rng = random.Random(seed)
    contacts = []
    meetings = []
    events_metadata = [
        {
            "eventKey": "gac_dinner",
            "title": "GAC 2026 Executive VIP Dinner",
            "date": "2026-10-14",
            "location": "Washington, D.C. (The Mayflower Hotel)",
            "type": "Executive Dinner",
            "description": "Private C-suite dinner for Credit Union CIOs and Advisory Partners discussing NCUA AI compliance."
        },
        {
            "eventKey": "symwest_booth",
            "title": "SymWest 2026 Booth #412 Visitors",
            "date": "2026-10-22",
            "location": "San Diego, CA (Convention Center)",
            "type": "Conference Booth",
            "description": "Symitar & Jack Henry ecosystem leaders visiting the live LLM Query Guardrails demo booth."
        },
        {
            "eventKey": "executive_meetup",
            "title": "Credit Union AI & Compliance Roundtable",
            "date": "2026-11-05",
            "location": "Chicago, IL / Hybrid",
            "type": "VIP Roundtable",
            "description": "Interactive executive briefing on zero-trust LLM database gateways and referral partner rewards."
        }
    ]
    events_attendees = {
        "gac_dinner": [],
        "symwest_booth": [],
        "executive_meetup": []
    }

    total_emails_sent = 0
    total_linkedin_sent = 0
    total_calls_made = 0
    total_enriched = 0

    contact_id_counter = 1

    # 1. Create the 30 Influencers first (IDs 1..30)
    influencer_records = []
    for idx, (fname, lname, title, company, email, state) in enumerate(INFLUENCER_PROFILES):
        fname_cap = fname[0].upper() + fname[1:]
        lname_cap = lname[0].upper() + lname[1:]
        full_name = f"{fname_cap} {lname_cap}"
        inf_id = contact_id_counter
        contact_id_counter += 1

        phone = f"+1 ({rng.randint(201, 989)}) {rng.randint(200, 999)}-{rng.randint(1000, 9999)}"
        match_pct = 98 if idx == 0 else rng.randint(89, 99)

        clean_lname = lname_cap.lower().replace("'", "")
        inf_record = {
            "id": inf_id,
            "firstName": fname_cap,
            "lastName": lname_cap,
            "fullName": full_name,
            "email": email.lower(),
            "jobTitle": title,
            "company": company,
            "phone": phone,
            "linkedinUrl": f"https://www.linkedin.com/in/{fname_cap.lower()}-{clean_lname}",
            "industry": "Financial Advisory" if idx % 2 == 0 else "Credit Union Consulting",
            "sourceFile": "influencer_partner_network.csv",
            "assetSize": "$5B - $10B",
            "state": state,
            "attendedDinner": "Yes" if idx < 10 else "",
            "visitedBooth": "Yes" if 5 <= idx < 18 else "",
            "enriched": True,
            "enrichmentStatus": "verified_provider_data",
            "enrichmentSources": ["Explorium", "LinkedIn", "AI Grounding"],
            "enrichmentFields": ["professional_summary", "seniority", "network_reach", "buying_signals"],
            "aiEnrichment": {
                "professional_summary": f"{full_name} is a {title} at {company} advising 30+ credit union executive teams on core modernization and AI governance.",
                "seniority": "Partner / Executive Advisor",
                "department": "Executive Advisory",
                "buying_signals": "Actively referring credit union CIOs evaluating compliant LLM query gateways.",
                "confidence": "High (98%)"
            },
            "enrichedAt": "2026-09-25T10:00:00Z",
            "matchPercentage": match_pct,
            "leadTemp": "Hot Lead",
            "emailsSent": True,
            "emailSentAt": "2026-09-26T14:30:00Z",
            "emailProviderId": f"msg_inf_{inf_id}",
            "emailDraft": {
                "subject": f"Partner Referral Portal & Credit Union Briefings — {company}",
                "body": f"Hi {fname_cap},\n\nThank you for your continued partnership with our Credit Union LLM Compliance team. Your personalized Influencer Referral Portal is live with your 30 executive referrals tracked.\n\nBest,\nSDR Campaign Agent"
            },
            "linkedinSent": True,
            "linkedinSentAt": "2026-09-26T15:00:00Z",
            "linkedinDraft": {
                "body": f"Hi {fname_cap}, appreciate your warm introductions across the credit union CIO network! Tracking all 30 referrals in the partner portal."
            },
            "callsMade": [
                {
                    "date": "2026-09-27 11:00:00",
                    "outcome": "Partner Alignment Call Completed - 30 Referrals Active",
                    "status": "taken"
                }
            ],
            "hasScheduledCall": True,
            "hasTakenCall": True,
            "isInfluencer": True,
            "referrals": [],
            "referralCredits": 0
        }
        influencer_records.append(inf_record)
        contacts.append(inf_record)
        total_emails_sent += 1
        total_linkedin_sent += 1
        total_calls_made += 1
        total_enriched += 1

    # 2. For each of the 30 Influencers, generate 30 referred contacts (900 total prospects)
    for inf_idx, inf in enumerate(influencer_records):
        for ref_num in range(30):
            prospect_id = contact_id_counter
            contact_id_counter += 1

            fn = FIRST_NAMES[(inf_idx * 7 + ref_num * 3) % len(FIRST_NAMES)]
            ln = LAST_NAMES[(inf_idx * 11 + ref_num * 5) % len(LAST_NAMES)]
            full_name = f"{fn} {ln}"

            cu_prefix = CREDIT_UNION_PREFIXES[(inf_idx + ref_num) % len(CREDIT_UNION_PREFIXES)]
            cu_suffix = CREDIT_UNION_SUFFIXES[(inf_idx * 2 + ref_num) % len(CREDIT_UNION_SUFFIXES)]
            company = f"{cu_prefix} {cu_suffix}"
            domain = cu_prefix.lower().replace(" ", "") + "cu.org"
            email = f"{fn.lower()}.{ln.lower()}.{prospect_id}@{domain}"
            job_title = JOB_TITLES[(inf_idx + ref_num) % len(JOB_TITLES)]
            state = STATES[(inf_idx + ref_num) % len(STATES)]
            asset_size = ASSET_SIZES[(inf_idx + ref_num) % len(ASSET_SIZES)]
            phone = f"+1 ({rng.randint(201, 989)}) {rng.randint(200, 999)}-{rng.randint(1000, 9999)}"

            # Exact 50% (first 15 of 30) have scheduled & taken a call!
            has_call = ref_num < 15
            # 70% (first 21 of 30) are enriched
            is_enriched = ref_num < 21
            # 60% (first 18 of 30) have email & linkedin sent
            has_outreach = ref_num < 18

            lead_temp = "Hot Lead" if (has_call or ref_num < 18) else ("Warm Lead" if ref_num < 24 else "Cold Lead")
            match_pct = rng.randint(90, 99) if has_call else rng.randint(78, 92)
            credits_for_ref = 25 if has_call else 10

            calls_made = []
            if has_call:
                outcome_str = CALL_OUTCOMES_TAKEN[ref_num % len(CALL_OUTCOMES_TAKEN)]
                call_day = (ref_num % 20) + 1
                call_date_str = f"2026-09-{call_day:02d} 14:30:00"
                calls_made.append({
                    "date": call_date_str,
                    "outcome": outcome_str,
                    "status": "taken",
                    "durationSec": rng.randint(420, 1800)
                })
                total_calls_made += 1

                # Also create a scheduled/completed meeting entry for Kim Beluzo's referrals and top influencers
                if inf_idx < 6 or ref_num < 5:
                    meet_day = (ref_num % 25) + 2
                    meet_iso = f"2026-10-{meet_day:02d}T14:00:00.000Z"
                    meetings.append({
                        "id": f"meet-{prospect_id}",
                        "contactId": prospect_id,
                        "contactName": full_name,
                        "contactTitle": job_title,
                        "contactCompany": company,
                        "contactEmail": email,
                        "contactPhone": phone,
                        "platform": "Google Meet" if ref_num % 2 == 0 else "Microsoft Teams",
                        "meetingUrl": f"https://meet.google.com/gtm-{prospect_id}-demo",
                        "timeString": f"10/{meet_day:02d}/2026 at 02:00 PM (EST)",
                        "influencerName": inf["fullName"],
                        "influencerId": inf["id"],
                        "influencerCredits": credits_for_ref,
                        "status": "Call Taken & Follow-up Scheduled" if ref_num < 10 else "Scheduled",
                        "notes": f"Referred by {inf['fullName']}. {outcome_str}. Discussing NCUA-compliant LLM database guardrails for {company}.",
                        "datetimeRaw": meet_iso
                    })

            if is_enriched:
                total_enriched += 1
            if has_outreach:
                total_emails_sent += 1
                total_linkedin_sent += 1

            prospect_record = {
                "id": prospect_id,
                "firstName": fn,
                "lastName": ln,
                "fullName": full_name,
                "email": email,
                "jobTitle": job_title,
                "company": company,
                "phone": phone,
                "linkedinUrl": f"https://www.linkedin.com/in/{fn.lower()}-{ln.lower()}-{prospect_id}",
                "industry": "Credit Union",
                "sourceFile": f"Referred by {inf['fullName']}",
                "assetSize": asset_size,
                "state": state,
                "attendedDinner": "Yes" if (inf_idx == 0 and ref_num < 5) else "",
                "visitedBooth": "Yes" if (inf_idx == 0 and 5 <= ref_num < 10) else "",
                "enriched": is_enriched,
                "enrichmentStatus": "verified_provider_data" if is_enriched else "pending",
                "enrichmentSources": ["Explorium", "AI Dossier"] if is_enriched else [],
                "enrichmentFields": ["professional_summary", "seniority", "buying_signals"] if is_enriched else [],
                "aiEnrichment": {
                    "professional_summary": f"{full_name} leads technology and member operations as {job_title} at {company} ({asset_size} assets).",
                    "seniority": "C-Suite / VP",
                    "department": "IT & Core Banking",
                    "buying_signals": f"Warm intro from {inf['fullName']}; evaluating automated data compliance.",
                    "confidence": "High (95%)"
                } if is_enriched else {},
                "enrichedAt": "2026-09-26T12:00:00Z" if is_enriched else "",
                "matchPercentage": match_pct,
                "leadTemp": lead_temp,
                "emailsSent": has_outreach,
                "emailSentAt": "2026-09-27T09:15:00Z" if has_outreach else "",
                "emailProviderId": f"msg_pros_{prospect_id}" if has_outreach else "",
                "emailDraft": {
                    "subject": f"Introduction via {inf['fullName']} — Safe LLM compliance for {company}",
                    "body": f"Hi {fn},\n\n{inf['fullName']} suggested I connect with you regarding your work as {job_title} at {company}.\n\nWe provide query validation guardrails and automated compliance pipelines built for credit unions.\n\nWould 15 minutes next Tuesday work for a quick briefing?\n\nBest,\nSDR Campaign Agent"
                },
                "linkedinSent": has_outreach,
                "linkedinSentAt": "2026-09-27T10:00:00Z" if has_outreach else "",
                "linkedinDraft": {
                    "body": f"Hi {fn}, connecting via {inf['fullName']}. Impressed by your leadership at {company} and would love to share our credit union AI compliance benchmarks."
                },
                "callsMade": calls_made,
                "hasScheduledCall": has_call,
                "hasTakenCall": has_call,
                "isInfluencer": False,
                "referredBy": inf["fullName"],
                "influencerId": inf["id"],
                "influencerEmail": inf["email"]
            }

            contacts.append(prospect_record)

            # Add to influencer's referrals list
            inf["referrals"].append({
                "id": prospect_id,
                "fullName": full_name,
                "jobTitle": job_title,
                "company": company,
                "email": email,
                "phone": phone,
                "credits": credits_for_ref,
                "hasScheduledCall": has_call,
                "hasTakenCall": has_call,
                "callOutcome": calls_made[0]["outcome"] if calls_made else "Pending Call",
                "leadTemp": lead_temp,
                "date": f"2026-09-{(ref_num % 25) + 1:02d}"
            })
            inf["referralCredits"] += credits_for_ref

            # Populate events with some of these contacts
            if inf_idx < 8 and ref_num == 0:
                events_attendees["gac_dinner"].append({
                    "id": prospect_id,
                    "contactId": prospect_id,
                    "fullName": full_name,
                    "jobTitle": job_title,
                    "company": company,
                    "email": email,
                    "phone": phone,
                    "eventStatus": "Attended",
                    "eventNotes": f"VIP Guest of {inf['fullName']}. Discussed core banking LLM security."
                })
            elif inf_idx < 10 and ref_num == 1:
                events_attendees["symwest_booth"].append({
                    "id": prospect_id,
                    "contactId": prospect_id,
                    "fullName": full_name,
                    "jobTitle": job_title,
                    "company": company,
                    "email": email,
                    "phone": phone,
                    "eventStatus": "Visited Booth",
                    "eventNotes": f"Scanned badge at Booth #412. Referred by {inf['fullName']}."
                })
            elif inf_idx < 8 and ref_num == 2:
                events_attendees["executive_meetup"].append({
                    "id": prospect_id,
                    "contactId": prospect_id,
                    "fullName": full_name,
                    "jobTitle": job_title,
                    "company": company,
                    "email": email,
                    "phone": phone,
                    "eventStatus": "Registered",
                    "eventNotes": f"Executive AI Roundtable attendee (Referred by {inf['fullName']})."
                })

    state = {
        "contacts": contacts,
        "events": events_attendees,
        "eventsMeta": events_metadata,
        "stats": {
            "emailsSent": total_emails_sent,
            "linkedinSent": total_linkedin_sent,
            "callsMade": total_calls_made,
            "enrichedCount": total_enriched
        },
        "meetings": meetings,
        "approvals": [],
        "workflowRuns": [],
        "currentOutboundSubtab": "influencers",
        "autoEnrich": True
    }
    return state


if __name__ == "__main__":
    data = build_synthetic_dataset()
    inf_count = sum(1 for c in data["contacts"] if c.get("isInfluencer"))
    pros_count = sum(1 for c in data["contacts"] if not c.get("isInfluencer"))
    kim_refs = [c for c in data["contacts"] if c.get("referredBy") == "Kim Beluzo"]
    kim_calls = [c for c in kim_refs if c.get("hasTakenCall")]
    print(f"Generated {len(data['contacts'])} total contacts: {inf_count} Influencers, {pros_count} Referred Prospects.")
    print(f"Kim Beluzo referrals: {len(kim_refs)} total, {len(kim_calls)} have taken/scheduled a call.")
