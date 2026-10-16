-- Adds 15 location-independent ready-made templates. Requires public.templates.
-- Existing installations: run this file only; do not rerun the industry seed.
-- Safe to rerun: refreshes only these managed system templates, not personal copies.
-- Does not change spreadsheet routing, schedule emails, or send anything.
begin;

with business_copy (
  seed_key, category, subject_line, challenge, audience,
  point_1_title, point_1_body, point_2_title, point_2_body,
  point_3_title, point_3_body, point_4_title, point_4_body
) as (
  values
  (
    'business-marketing-agency', 'Marketing agency',
    'Practical AI support for the team at {{company_name}}',
    'Marketing agencies juggle creative work, client expectations, campaign deadlines, and reporting. Repetitive coordination and disconnected tools can leave less time for strategy and stronger client relationships.',
    'marketing agencies simplify delivery and give their teams more time for high-value client work',
    'Content & Creative', 'AI-assisted research, content briefs, and first drafts that your team reviews for brand voice and accuracy.',
    'Client Reporting', 'Connected dashboards and report drafts that bring campaign results together without repeated spreadsheet work.',
    'Workflow Automation', 'Streamlined client intake, approvals, task handoffs, and reminders across your existing tools.',
    'Agency Knowledge', 'Searchable assistants for past campaigns, brand guidelines, proposals, and internal processes.'
  ),
  (
    'business-digital-marketing-agency', 'Digital marketing agency',
    'Connecting campaign data and workflows at {{company_name}}',
    'Digital marketing teams work across advertising platforms, analytics, websites, and CRMs. Keeping reporting consistent and responding to new leads quickly can take time away from campaign improvement.',
    'digital marketing agencies connect campaign data and automate repetitive delivery tasks',
    'Campaign Insights', 'Unified dashboards and anomaly alerts that help your team review spend, conversions, and channel performance.',
    'Content & SEO Support', 'Human-reviewed tools for topic research, content briefs, keyword organization, and website-content updates.',
    'Lead Follow-up', 'Automated inquiry routing, CRM updates, and follow-up reminders based on your approved workflows.',
    'Reporting Automation', 'Reusable reporting pipelines and client-ready summaries that reduce manual data collection.'
  ),
  (
    'business-it-company', 'IT company',
    'Reducing repetitive IT work at {{company_name}}',
    'IT teams balance support requests, infrastructure maintenance, customer expectations, and growing documentation. Routine tasks and scattered knowledge can slow resolution and stretch technical capacity.',
    'IT companies improve service operations with practical AI and workflow automation',
    'Service Desk', 'AI-assisted ticket classification, suggested responses, and knowledge retrieval with technician oversight.',
    'Routine Automation', 'Streamlined onboarding, account requests, asset updates, and recurring service reports.',
    'Infrastructure Insights', 'Connected monitoring dashboards and anomaly alerts that help teams prioritize investigation.',
    'Cloud & Knowledge', 'Modernized cloud integrations and searchable documentation with appropriate access controls.'
  ),
  (
    'business-it-consulting-company', 'IT consulting company',
    'Supporting consulting delivery at {{company_name}} with AI',
    'IT consulting firms need to scope projects clearly, reuse technical knowledge, and deliver consistent results across clients. Proposal work, documentation, and fragmented project information can add significant overhead.',
    'IT consulting companies apply AI across discovery, delivery, and internal operations',
    'Discovery & Proposals', 'Assistants for requirements summaries, proposal drafts, and solution research reviewed by your consultants.',
    'Delivery Knowledge', 'Search across approved architecture documents, implementation guides, and reusable project assets.',
    'Project Workflows', 'Automation for meeting notes, action tracking, status reports, and client handoffs.',
    'AI & Cloud Delivery', 'Support for focused AI proofs of concept, system integration, and governed cloud modernization.'
  ),
  (
    'business-software-company', 'Software company',
    'Building useful AI capabilities at {{company_name}}',
    'Software companies are expected to ship useful features, support customers, and maintain reliable systems while controlling engineering effort and cloud costs. Repetitive work can slow product progress.',
    'software companies introduce AI into products and everyday engineering workflows',
    'Product Features', 'Purpose-built assistants, semantic search, and workflow automation integrated into your application.',
    'Engineering Support', 'Human-reviewed tools for code understanding, test preparation, documentation, and incident summaries.',
    'Customer Support', 'Knowledge-based AI agents that answer routine questions and hand complex cases to your team.',
    'Cloud & Data', 'Improved data pipelines, observability, integrations, and cloud cost visibility.'
  ),
  (
    'business-business-consulting', 'Business consulting',
    'Simplifying consulting workflows at {{company_name}}',
    'Business consulting teams spend valuable time gathering information, preparing proposals, and assembling client deliverables. Repeated manual work can limit time for analysis, recommendations, and client relationships.',
    'business consulting firms organize knowledge and streamline repeatable client work',
    'Research & Knowledge', 'Searchable assistants for approved research, past engagements, frameworks, and internal expertise.',
    'Proposals & Reports', 'AI-assisted first drafts and document summaries with consultant review before client delivery.',
    'Client Operations', 'Automated intake, meeting notes, task handoffs, and follow-up reminders.',
    'Business Analytics', 'Connected dashboards that help consultants turn client data into practical operational insights.'
  ),
  (
    'business-management-consulting', 'Management consulting',
    'Supporting transformation delivery at {{company_name}}',
    'Management consulting firms work with complex information, demanding stakeholders, and tight delivery timelines. Keeping analysis, decisions, and transformation progress connected can create a substantial coordination burden.',
    'management consulting teams combine structured knowledge with practical decision-support tools',
    'Engagement Intelligence', 'Human-reviewed summaries and search across client documents, interviews, and approved research.',
    'Transformation Tracking', 'Dashboards for milestones, risks, dependencies, and operational performance.',
    'Scenario Analysis', 'Tools that help consultants compare assumptions and business scenarios without replacing professional judgment.',
    'Delivery Automation', 'Streamlined presentation drafts, meeting actions, status reporting, and knowledge handovers.'
  ),
  (
    'business-accounting-firm', 'Accounting firm',
    'Reducing administrative workload at {{company_name}}',
    'Accounting firms manage document-heavy work, recurring deadlines, and frequent client requests. Collecting records and resolving routine exceptions can take time away from careful review and advisory conversations.',
    'accounting firms streamline administrative and reporting workflows while keeping accountants in control',
    'Document Intake', 'AI-assisted extraction and organization of invoices, receipts, and client records for review.',
    'Reconciliation Support', 'Suggested matches and exception flags that help your team investigate discrepancies.',
    'Client Coordination', 'Automated document requests, deadline reminders, and routine status updates.',
    'Reporting Workflows', 'Connected dashboards and report preparation that preserve human review of financial outputs.'
  ),
  (
    'business-bookkeeping-service', 'Bookkeeping service',
    'Streamlining bookkeeping operations at {{company_name}}',
    'Bookkeeping teams handle recurring data entry, missing receipts, reconciliation questions, and month-end reporting. These repetitive tasks can make it harder to keep client records current and resolve exceptions quickly.',
    'bookkeeping services reduce repetitive administration and organize client workflows',
    'Receipt Processing', 'AI-assisted capture and suggested categorization of receipts and invoices, ready for bookkeeper approval.',
    'Reconciliation Work', 'Matching suggestions and exception queues that focus attention on records needing review.',
    'Client Follow-up', 'Automated requests for missing documents, clarification reminders, and recurring task checklists.',
    'Month-end Visibility', 'Simple dashboards and reporting workflows that help track completion across client accounts.'
  ),
  (
    'business-recruitment-agency', 'Recruitment agency',
    'Supporting recruitment delivery at {{company_name}}',
    'Recruitment agencies balance candidate communication, client requirements, interview coordination, and growing applicant records. Manual administration can slow responses and reduce time for meaningful candidate and client conversations.',
    'recruitment agencies organize information and automate coordination while keeping hiring decisions with people',
    'Candidate Information', 'AI-assisted resume parsing, search, and role-fit summaries for recruiter review, not automatic hiring decisions.',
    'Communication', 'Approved message drafts, application updates, and candidate follow-up reminders.',
    'Interview Coordination', 'Scheduling workflows, reminders, and ATS or CRM updates across your existing systems.',
    'Recruitment Insights', 'Dashboards for pipeline progress, response times, and placement activity, with appropriate access controls.'
  ),
  (
    'business-construction-company', 'Construction company',
    'Connecting project information at {{company_name}}',
    'Construction companies manage changing plans, site updates, supplier documents, and project deadlines. Disconnected information and repeated administration can make cost control and coordination more difficult.',
    'construction companies connect project data and simplify day-to-day operational work',
    'Estimating Support', 'AI-assisted document extraction and bid comparisons that support estimator review.',
    'Project Documents', 'Searchable access to approved drawings, specifications, contracts, and project correspondence.',
    'Site Reporting', 'Structured progress summaries from field notes, photos, and daily reports for your team to review.',
    'Office Automation', 'Streamlined invoice routing, purchase requests, approvals, and project-status dashboards.'
  ),
  (
    'business-general-contractor', 'General contractor',
    'Simplifying contractor coordination at {{company_name}}',
    'General contractors coordinate subcontractors, client requests, schedules, and constant document changes. Tracking decisions and following up across teams can create delays and unnecessary administrative work.',
    'general contractors improve coordination and keep project information easier to find',
    'Subcontractor Coordination', 'Automated task reminders, document collection, and progress updates across project partners.',
    'RFIs & Changes', 'AI-assisted organization and summarization of RFIs, change requests, and supporting correspondence.',
    'Job-cost Visibility', 'Connected dashboards for commitments, invoices, progress, and items needing investigation.',
    'Project Communication', 'Human-reviewed meeting summaries, client updates, and searchable project records.'
  ),
  (
    'business-real-estate-agency', 'Real estate agency',
    'Improving inquiry response at {{company_name}}',
    'Real estate agencies need to respond quickly to inquiries while coordinating listings, viewings, documents, and follow-ups. Fragmented lead information can make it harder to provide consistent service.',
    'real estate agencies organize leads and simplify the work around each client relationship',
    'Inquiry Support', 'AI assistants for approved listing information and initial questions, with handoff to your agents.',
    'Lead Coordination', 'CRM updates, viewing reminders, and follow-up workflows based on your approved criteria.',
    'Listing Content', 'Human-reviewed property-description drafts, content updates, and document organization.',
    'Agency Insights', 'Dashboards for inquiry sources, response times, listing activity, and pipeline progress.'
  ),
  (
    'business-property-management-company', 'Property management company',
    'Simplifying property operations at {{company_name}}',
    'Property managers handle maintenance requests, resident questions, contractor coordination, and owner reporting across multiple properties. Repeated manual updates can make consistent service harder to maintain.',
    'property management companies streamline service workflows and improve operational visibility',
    'Resident Support', 'AI assistants for approved property information and routine questions, with escalation to your team.',
    'Maintenance Coordination', 'Request classification, work-order routing, contractor reminders, and status updates with staff approval.',
    'Lease & Document Work', 'Organized document search, renewal reminders, and administrative checklists.',
    'Owner Reporting', 'Connected dashboards and report drafts covering occupancy, maintenance activity, and operating costs.'
  ),
  (
    'business-landscaping-company', 'Landscaping company',
    'Practical automation for {{company_name}}',
    'Landscaping companies balance new inquiries, estimates, crew schedules, recurring visits, and customer updates. Repetitive office work and last-minute changes can take attention away from delivering quality service.',
    'landscaping companies simplify customer communication and daily service coordination',
    'Inquiries & Estimates', 'AI-assisted inquiry handling, quote drafts, and follow-up reminders for your team to review.',
    'Crew & Visit Planning', 'Scheduling tools, route-planning support, and reminders for recurring maintenance visits.',
    'Job Updates', 'Organized photos, field notes, customer notifications, and change requests in one workflow.',
    'Office Automation', 'Streamlined invoicing handoffs, payment reminders, and dashboards for jobs and service requests.'
  )
)
insert into public.templates (
  user_id, seed_key, name, description, category, subject_template, html_body,
  plain_text_body, signature_behavior, is_system, is_active, is_archived
)
select
  null, seed_key, category || ' Outreach',
  'AI and digital-transformation outreach for ' || category || '. Suitable for any location.',
  category, subject_line,
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
{{signature}}
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
  'token_only', true, true, false
from business_copy
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
  updated_at = timezone('utc', now())
where public.templates.is_system and public.templates.user_id is null;

commit;
