-- Safe, idempotent system-template seed.
-- Run after schema.sql. Categories match the 23 routing taxonomy values exactly.

insert into public.templates (
  user_id, seed_key, name, description, category, subject_template, html_body,
  plain_text_body, signature_behavior, is_system, is_active, is_archived
) values (
  null,
  'blank-template',
  'Blank Template',
  'A clean starting point for a personal template.',
  null,
  'Your subject',
  '<p>Hi {{first_name}},</p><p></p><p>{{signature}}</p>',
  E'Hi {{first_name}},\n\n{{signature}}',
  'token_only',
  true,
  true,
  false
)
on conflict (seed_key) do nothing;

with industry_copy (
  seed_key, category, subject_line, challenge, audience,
  point_1_title, point_1_body, point_2_title, point_2_body,
  point_3_title, point_3_body, point_4_title, point_4_body
) as (
  values
  (
    'industry-financial-services-banking',
    'Financial Services & Banking',
    'Modernizing financial operations at {{company_name}}',
    'Financial institutions face a constant balancing act: modernizing legacy systems, tightening compliance, fighting fraud, and speeding up service without ballooning budgets.',
    'banks, credit unions, lenders, and fintech teams deploy high-impact AI solutions tailored to operational and regulatory constraints',
    'Risk & Fraud', 'Custom ML models for fraud detection, credit scoring, transaction monitoring, and real-time risk dashboards.',
    'Compliance & Automation', 'Streamlined KYC, AML, loan processing, and document review to reduce manual errors and turnaround times.',
    'Support & Operations', '24/7 AI agents that resolve routine customer inquiries and equip service teams with faster, consistent answers.',
    'Infrastructure', 'Secure migration from legacy banking platforms to governed cloud and modern data environments.'
  ),
  (
    'industry-insurance',
    'Insurance',
    'Practical AI opportunities for {{company_name}}',
    'Insurance teams are under pressure to settle claims faster, improve underwriting accuracy, detect fraud, and deliver better policyholder experiences while controlling loss and operating costs.',
    'carriers, brokers, reinsurers, and claims organizations modernize decision-making and service operations',
    'Claims Automation', 'AI-assisted intake, document extraction, triage, damage assessment, and adjuster copilots that shorten claim cycles.',
    'Underwriting & Risk', 'Predictive models and decision-support tools for pricing, risk selection, fraud detection, and portfolio monitoring.',
    'Policyholder Service', 'Always-available agents for policy questions, coverage guidance, status updates, and renewal support.',
    'Core Modernization', 'Secure data integration and workflow modernization across policy, billing, claims, and partner systems.'
  ),
  (
    'industry-healthcare-life-sciences',
    'Healthcare & Life Sciences',
    'Improving healthcare operations at {{company_name}} with AI',
    'Healthcare and life-sciences organizations must improve patient and research outcomes while managing workforce shortages, fragmented data, administrative burden, and strict privacy requirements.',
    'providers, payers, laboratories, and life-sciences teams introduce responsible AI into high-friction workflows',
    'Patient Access', 'AI agents for scheduling, intake, eligibility questions, reminders, and multilingual patient support.',
    'Clinical & Research Operations', 'Human-reviewed copilots for summarization, trial workflows, knowledge retrieval, and operational decision support.',
    'Revenue Cycle', 'Automation for coding support, prior authorization, claims review, denial analysis, and payment workflows.',
    'Secure Health Data', 'Governed integration and analytics across EHR, laboratory, research, and operational data sources.'
  ),
  (
    'industry-retail-ecommerce',
    'Retail & E-commerce',
    'Driving retail growth and efficiency at {{company_name}}',
    'Retailers must grow conversion and loyalty while navigating volatile demand, high fulfillment costs, inventory imbalance, and rising expectations for instant service.',
    'retail and e-commerce teams turn customer, product, and operational data into measurable growth',
    'Personalization', 'Recommendation, search, merchandising, and next-best-action models tailored to each customer journey.',
    'Demand & Inventory', 'Forecasting and replenishment tools that reduce stockouts, overstocks, and costly markdowns.',
    'Customer Service', 'AI agents for product discovery, order questions, returns, and post-purchase support across channels.',
    'Commerce Operations', 'Automation for catalog enrichment, pricing analysis, review insights, and fulfillment exception handling.'
  ),
  (
    'industry-manufacturing-industrial',
    'Manufacturing & Industrial',
    'AI-led operational improvements for {{company_name}}',
    'Manufacturers are expected to raise throughput and quality despite aging equipment, skills gaps, supply volatility, and pressure to reduce waste and unplanned downtime.',
    'manufacturing and industrial teams connect plant data with practical automation and decision support',
    'Predictive Maintenance', 'Machine-learning models that identify failure signals, prioritize interventions, and reduce unplanned downtime.',
    'Quality Inspection', 'Computer-vision systems for defect detection, process verification, and root-cause analysis.',
    'Planning & Supply', 'Demand, production, inventory, and supplier-risk analytics for more resilient operations.',
    'Industrial Automation', 'Operator copilots, digital work instructions, and workflow automation integrated with existing plant systems.'
  ),
  (
    'industry-telecommunications',
    'Telecommunications',
    'AI opportunities across network and service operations at {{company_name}}',
    'Telecommunications providers must improve network reliability and customer retention while managing complex infrastructure, service costs, fraud, and rapid growth in data demand.',
    'telecom operators and service providers apply AI across network, revenue, and customer operations',
    'Network Intelligence', 'Predictive capacity planning, anomaly detection, fault localization, and automated incident prioritization.',
    'Customer Retention', 'Churn prediction, personalized offers, and next-best-action tools for sales and care teams.',
    'Service Operations', 'AI agents and technician copilots that accelerate troubleshooting, field service, and issue resolution.',
    'Revenue Assurance', 'Analytics for subscription fraud, leakage detection, billing anomalies, and collections prioritization.'
  ),
  (
    'industry-technology-software',
    'Technology & Software',
    'Accelerating product and engineering outcomes at {{company_name}}',
    'Technology companies must ship differentiated products faster while controlling cloud costs, reducing engineering toil, and scaling customer support without sacrificing reliability.',
    'software, SaaS, and technology teams build useful AI capabilities into products and internal operations',
    'AI Product Features', 'Secure copilots, semantic search, recommendations, and task automation embedded into customer workflows.',
    'Engineering Productivity', 'Assistants for code understanding, testing, documentation, incident response, and developer self-service.',
    'Customer Success', 'AI agents and account insights that improve onboarding, support resolution, adoption, and retention.',
    'Cloud & Data', 'Architecture modernization, observability, governed data platforms, and cost-performance optimization.'
  ),
  (
    'industry-government-public-sector',
    'Government & Public Sector',
    'Responsible AI modernization for {{company_name}}',
    'Public-sector organizations must deliver accessible services with limited resources while managing legacy systems, growing case volumes, data silos, transparency, and security obligations.',
    'government agencies and public-service teams modernize workflows with accountable, human-centered AI',
    'Citizen Services', 'Accessible AI agents for program information, application guidance, status updates, and multilingual support.',
    'Case & Document Work', 'Secure classification, extraction, summarization, and routing for forms, records, and case files.',
    'Operational Analytics', 'Decision-support dashboards for demand, resource allocation, service levels, and program outcomes.',
    'Secure Modernization', 'Phased replacement and integration of legacy platforms with auditable governance and human oversight.'
  ),
  (
    'industry-education-training',
    'Education & Training',
    'Improving learner and administrative outcomes at {{company_name}}',
    'Education providers must support diverse learners while responding to staff workload, retention challenges, administrative complexity, and increasing demand for flexible digital experiences.',
    'schools, universities, training providers, and learning teams deploy practical and responsible AI',
    'Learner Support', 'Always-available assistants for enrollment, course questions, deadlines, resources, and student services.',
    'Personalized Learning', 'Adaptive practice, content recommendations, feedback support, and instructor-controlled learning tools.',
    'Administrative Automation', 'Streamlined admissions, document processing, scheduling, reporting, and routine communications.',
    'Student Success Analytics', 'Early-warning and engagement insights that help staff prioritize timely human intervention.'
  ),
  (
    'industry-logistics-supply-chain',
    'Logistics & Supply Chain',
    'Building a more resilient supply chain at {{company_name}}',
    'Logistics teams must improve speed and visibility while dealing with uncertain demand, capacity constraints, inventory imbalance, documentation overhead, and costly disruptions.',
    'logistics, warehousing, distribution, and supply-chain teams improve planning and execution',
    'Demand & Capacity', 'Forecasting and scenario models for inventory, labor, carrier capacity, and supplier planning.',
    'Warehouse Operations', 'AI-assisted slotting, picking optimization, computer vision, and exception management.',
    'Routing & Visibility', 'Dynamic routing, ETA prediction, shipment monitoring, and proactive delay alerts.',
    'Documents & Risk', 'Automation for bills of lading, invoices, customs documents, claims, and supplier-risk signals.'
  ),
  (
    'industry-transportation-mobility',
    'Transportation & Mobility',
    'AI opportunities for safer, more efficient mobility at {{company_name}}',
    'Transportation operators must improve safety, reliability, and asset utilization while managing fuel costs, maintenance complexity, fluctuating demand, and passenger expectations.',
    'fleet, transit, mobility, and transportation teams make operations safer and more efficient',
    'Fleet Optimization', 'Dispatch, routing, load, fuel, and utilization models that improve daily fleet economics.',
    'Predictive Maintenance', 'Asset-health monitoring and failure prediction for vehicles, infrastructure, and critical equipment.',
    'Passenger Experience', 'AI agents for booking, disruption updates, accessibility support, and personalized travel information.',
    'Safety & Operations', 'Computer vision, anomaly detection, and decision-support dashboards with human review for critical actions.'
  ),
  (
    'industry-travel-tourism-hospitality',
    'Travel, Tourism & Hospitality',
    'Elevating guest experience and operations at {{company_name}}',
    'Travel and hospitality businesses must deliver memorable, personalized service while managing seasonal demand, staffing pressure, fragmented systems, and volatile pricing.',
    'hotels, travel operators, tourism businesses, and hospitality groups improve revenue and guest operations',
    'Guest Experience', 'Multilingual AI concierges for discovery, booking, itinerary changes, on-property questions, and follow-up.',
    'Revenue Management', 'Demand forecasting, pricing support, offer personalization, and channel-performance analysis.',
    'Service Operations', 'Automation for reservations, requests, housekeeping coordination, disruption handling, and staff knowledge.',
    'Customer Intelligence', 'Unified guest profiles, feedback analysis, loyalty insights, and next-best-action recommendations.'
  ),
  (
    'industry-media-entertainment',
    'Media & Entertainment',
    'AI-driven audience and content opportunities for {{company_name}}',
    'Media businesses must capture audience attention and monetize content while managing production costs, fragmented rights, content volume, and rapidly changing consumption habits.',
    'publishers, studios, streaming services, and entertainment teams improve content and audience operations',
    'Discovery & Personalization', 'Recommendation, semantic search, and audience models that increase discovery, engagement, and retention.',
    'Content Operations', 'Human-reviewed tools for metadata, clipping, localization, summarization, and production workflow support.',
    'Audience & Revenue', 'Subscription propensity, churn prediction, advertising optimization, and campaign intelligence.',
    'Rights & Safety', 'Content classification, rights metadata extraction, moderation assistance, and brand-safety controls.'
  ),
  (
    'industry-energy-utilities',
    'Energy & Utilities',
    'Modernizing asset and customer operations at {{company_name}}',
    'Energy and utility organizations must maintain reliable, affordable service while managing aging assets, demand volatility, field risk, regulatory scrutiny, and the transition to lower-carbon operations.',
    'energy producers, grid operators, and utility teams improve asset, field, and customer performance',
    'Asset Reliability', 'Predictive maintenance and anomaly detection for generation, grid, pipeline, and plant equipment.',
    'Demand & Grid Intelligence', 'Load forecasting, outage prediction, dispatch support, and distributed-energy analytics.',
    'Field Operations', 'Technician copilots, work-order prioritization, safety knowledge, and visual inspection support.',
    'Customer & Compliance', 'AI service agents, usage insights, reporting automation, and auditable regulatory workflows.'
  ),
  (
    'industry-construction-real-estate',
    'Construction & Real Estate',
    'Improving project and property performance at {{company_name}}',
    'Construction and real-estate teams must protect margins and schedules while managing fragmented project data, labor constraints, site risk, tenant expectations, and changing market conditions.',
    'contractors, developers, property managers, and real-estate teams connect project and portfolio data',
    'Estimating & Planning', 'AI-assisted takeoffs, bid analysis, schedule-risk prediction, and resource planning.',
    'Site Execution', 'Progress tracking, document retrieval, safety observations, and issue detection using field data and vision.',
    'Leasing & Property Service', 'AI agents for inquiries, qualification, maintenance requests, tenant communication, and renewals.',
    'Portfolio Intelligence', 'Unified analytics for occupancy, operating cost, asset performance, and investment scenarios.'
  ),
  (
    'industry-professional-business-services',
    'Professional & Business Services',
    'Scaling knowledge and service delivery at {{company_name}}',
    'Professional-services firms must deliver consistent expertise and protect margins while navigating knowledge silos, proposal workload, administrative overhead, and rising client expectations.',
    'consulting, accounting, outsourcing, and business-services teams scale expertise without losing quality',
    'Knowledge Assistants', 'Secure retrieval and copilots that help teams find precedents, methods, deliverables, and account context.',
    'Document Workflows', 'Automation for proposals, reports, meeting notes, data extraction, review, and approval cycles.',
    'Delivery Performance', 'Resource, utilization, project-risk, and margin insights for leaders and engagement teams.',
    'Client Experience', 'AI-enabled onboarding, status communication, service desks, and personalized account support.'
  ),
  (
    'industry-legal-services',
    'Legal Services',
    'Responsible legal workflow automation for {{company_name}}',
    'Legal teams must respond faster and control matter costs while managing expanding document volumes, knowledge fragmentation, client-service demands, confidentiality, and accuracy requirements.',
    'law firms and in-house legal teams automate high-volume work while retaining attorney review and control',
    'Document Review', 'Human-reviewed extraction, comparison, clause analysis, redaction support, and due-diligence workflows.',
    'Research & Knowledge', 'Secure assistants that retrieve authorities, precedents, policies, and internal work product with citations.',
    'Matter Operations', 'Automation for intake, triage, chronology building, task tracking, billing review, and client updates.',
    'Security & Governance', 'Private AI environments with access controls, audit trails, retention rules, and clear human approval points.'
  ),
  (
    'industry-automotive',
    'Automotive',
    'AI opportunities across automotive operations at {{company_name}}',
    'Automotive businesses must improve quality and customer loyalty while navigating software-defined products, supply volatility, complex manufacturing, dealer operations, and changing mobility expectations.',
    'automakers, suppliers, dealers, and automotive-service teams improve product and operational performance',
    'Manufacturing & Quality', 'Predictive maintenance, vision inspection, process optimization, and supplier-quality analytics.',
    'Sales & Dealer Operations', 'Lead prioritization, offer personalization, inventory insights, and AI assistants for dealer teams.',
    'Aftersales', 'Service scheduling, technician copilots, parts forecasting, warranty analysis, and customer support automation.',
    'Connected Product Data', 'Secure pipelines and analytics for vehicle telemetry, feature usage, diagnostics, and product improvement.'
  ),
  (
    'industry-consumer-goods',
    'Consumer Goods',
    'Turning consumer and supply data into growth at {{company_name}}',
    'Consumer-goods companies must protect brand growth and margins while responding to fast-changing demand, retailer pressure, supply disruption, promotional complexity, and fragmented consumer signals.',
    'consumer-products teams connect brand, commercial, and supply-chain decisions',
    'Consumer Intelligence', 'AI analysis of reviews, social signals, research, and service data to identify needs and product opportunities.',
    'Demand & Supply', 'Forecasting, inventory optimization, scenario planning, and supplier-risk monitoring.',
    'Revenue Growth', 'Trade-promotion analysis, assortment insights, pricing support, and retailer-specific recommendations.',
    'Quality & Service', 'Complaint classification, root-cause analysis, quality monitoring, and automated consumer support.'
  ),
  (
    'industry-human-resources-recruitment',
    'Human Resources & Recruitment',
    'Improving talent operations at {{company_name}} with responsible AI',
    'HR and recruitment teams must find and support talent faster while managing high application volume, repetitive administration, skills gaps, employee expectations, and fairness obligations.',
    'employers, staffing firms, and talent teams streamline hiring and workforce support with responsible AI',
    'Talent Discovery', 'Skills-based search, candidate matching, sourcing assistance, and recruiter copilots with review controls.',
    'Hiring Operations', 'Automation for intake, screening support, scheduling, interview notes, and candidate communication.',
    'Employee Support', 'Secure HR agents for policies, benefits, onboarding, learning, and common service requests.',
    'Workforce Insights', 'Analytics for skills, capacity, retention, mobility, and engagement with bias testing and human oversight.'
  ),
  (
    'industry-marketing-advertising',
    'Marketing & Advertising',
    'Scaling marketing performance at {{company_name}}',
    'Marketing teams must produce more relevant content and prove return on spend while dealing with fragmented data, rising acquisition costs, channel complexity, and pressure for faster experimentation.',
    'brands, agencies, and marketing organizations improve creative and campaign operations',
    'Content Operations', 'Human-directed ideation, adaptation, localization, brand review, and production workflow automation.',
    'Campaign Optimization', 'Budget, bid, audience, timing, and next-best-action models that improve performance.',
    'Lead & Customer Intelligence', 'Scoring, segmentation, journey analysis, personalization, and sales handoff insights.',
    'Measurement', 'Unified reporting, anomaly detection, experiment analysis, and attribution decision support.'
  ),
  (
    'industry-security-defense',
    'Security & Defense',
    'Secure, mission-focused AI opportunities for {{company_name}}',
    'Security and defense organizations must act on complex information quickly while protecting sensitive environments, maintaining critical assets, managing evolving threats, and preserving human accountability.',
    'security, aerospace, and defense teams deploy controlled AI for mission and operational support',
    'Threat Detection', 'Anomaly detection, alert prioritization, investigation copilots, and sensor-data analysis in secured environments.',
    'Intelligence Workflows', 'Human-reviewed extraction, translation, summarization, entity analysis, and knowledge retrieval.',
    'Readiness & Logistics', 'Predictive maintenance, parts forecasting, resource planning, and supply-risk analytics.',
    'Secure Infrastructure', 'Private deployments with strict access control, auditability, data boundaries, testing, and human authorization.'
  ),
  (
    'industry-cross-industry-general-business',
    'Cross-industry / General Business',
    'Practical AI opportunities for {{company_name}}',
    'Organizations across industries are being asked to grow, serve customers faster, and make better decisions while dealing with manual workflows, disconnected systems, rising costs, and limited technical capacity.',
    'business teams identify and deliver practical AI initiatives tied to measurable operational outcomes',
    'Workflow Automation', 'Document processing, approvals, data entry, reporting, and back-office workflows redesigned around human review.',
    'Customer & Employee Support', 'AI agents and knowledge assistants that provide fast, consistent answers around the clock.',
    'Analytics & Decisions', 'Forecasting, anomaly detection, dashboards, and copilots that turn scattered data into useful actions.',
    'Digital Modernization', 'Secure cloud, data, integration, and application improvements that create a foundation for scalable AI.'
  )
)
insert into public.templates (
  user_id, seed_key, name, description, category, subject_template, html_body,
  plain_text_body, signature_behavior, is_system, is_active, is_archived
)
select
  null,
  seed_key,
  category || ' Outreach',
  'AI and digital-transformation outreach for the ' || category || ' taxonomy bucket.',
  category,
  subject_line,
  format($html$
<p>Hi {{company_name}},</p>
<p>%s</p>
<p>At Inuberry Global, we help %s:</p>
<ul>
  <li><strong>%s:</strong> %s</li>
  <li><strong>%s:</strong> %s</li>
  <li><strong>%s:</strong> %s</li>
  <li><strong>%s:</strong> %s</li>
</ul>
<p>Would you be open to a brief 15-minute introductory call next week to explore where AI can drive the fastest ROI for your team? Let us know.</p>
<p>Best regards,</p>
<p>{{signature}}</p>
$html$,
    challenge, audience,
    point_1_title, point_1_body, point_2_title, point_2_body,
    point_3_title, point_3_body, point_4_title, point_4_body
  ),
  format($plain$
Hi {{company_name}},

%s

At Inuberry Global, we help %s:

- %s: %s
- %s: %s
- %s: %s
- %s: %s

Would you be open to a brief 15-minute introductory call next week to explore where AI can drive the fastest ROI for your team? Let us know.

Best regards,

{{signature}}
$plain$,
    challenge, audience,
    point_1_title, point_1_body, point_2_title, point_2_body,
    point_3_title, point_3_body, point_4_title, point_4_body
  ),
  'token_only',
  true,
  true,
  false
from industry_copy
on conflict (seed_key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  subject_template = excluded.subject_template,
  html_body = excluded.html_body,
  plain_text_body = excluded.plain_text_body,
  signature_behavior = excluded.signature_behavior,
  is_active = excluded.is_active,
  is_archived = excluded.is_archived,
  updated_at = timezone('utc', now());

do $$ begin
  raise notice 'Blank template and 23 industry outreach templates seeded.';
end $$;
