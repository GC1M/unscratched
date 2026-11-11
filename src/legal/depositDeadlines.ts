// General rules only, not legal advice. Laws change: review every row against its source at least once a year
// and bump DEPOSIT_TABLE_REVIEWED. Where a rule depends on conditions, the note says so instead of guessing.
export const DEPOSIT_TABLE_REVIEWED = '2026-11-11';

export interface DepositDeadline {
  code: string;
  name: string;
  /** Days after move-out to return the deposit. null: no simple statewide deadline, see the note. */
  days: number | null;
  /** Days to send the itemized list of deductions, only when it differs from `days`. */
  itemizedDays?: number;
  note: string;
  source: string;
}

export const DEPOSIT_DEADLINES: DepositDeadline[] = [
  { code: 'AL', name: 'Alabama', days: 60, note: 'Counted from the end of the tenancy and delivery of possession.', source: 'https://alison.legislature.state.al.us/code-of-alabama?section=35-9A-201' },
  { code: 'AK', name: 'Alaska', days: 14, note: '30 days if the tenant did not give proper notice to end the tenancy.', source: 'https://www.akleg.gov/basis/statutes.asp#34.03.070' },
  { code: 'AZ', name: 'Arizona', days: 14, note: '14 business days (weekends and holidays excluded), so the real date is later than shown.', source: 'https://www.azleg.gov/ars/33/01321.htm' },
  { code: 'AR', name: 'Arkansas', days: 60, note: 'Counted from the end of the tenancy and delivery of possession. Small landlords (5 or fewer units, self-managed) may be exempt.', source: 'https://arkansasag.gov/divisions/public-protection/homes/landlord-and-tenant-rights/' },
  { code: 'CA', name: 'California', days: 21, note: 'Itemized statement and any refund are both due within 21 days.', source: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1950.5' },
  { code: 'CO', name: 'Colorado', days: 30, note: 'One month by default; the lease can extend it to at most 60 days. A 2025 bill changed some of this section, so check the current text.', source: 'https://leg.colorado.gov/sites/default/files/renters_rights_-_colorado_law_summary.pdf' },
  { code: 'CT', name: 'Connecticut', days: 21, note: '21 days after the tenancy ends or 15 days after receiving the forwarding address, whichever is later (since October 2023).', source: 'https://www.cga.ct.gov/current/pub/chap_831.htm#sec_47a-21' },
  { code: 'DE', name: 'Delaware', days: 20, note: 'Itemized list and any refund are due within 20 days.', source: 'https://delcode.delaware.gov/title25/c055/index.html' },
  { code: 'DC', name: 'District of Columbia', days: 45, note: 'Itemized deductions and any refund are due within 45 days.', source: 'https://code.dccouncil.gov/us/dc/council/code/sections/42-3502.17' },
  { code: 'FL', name: 'Florida', days: 15, itemizedDays: 30, note: '15 days if nothing is deducted; 30 days to send written notice of any claim on the deposit.', source: 'https://www.flsenate.gov/Laws/Statutes/2024/83.49' },
  { code: 'GA', name: 'Georgia', days: 30, note: 'Itemized list and any refund are due within 30 days.', source: 'https://dca.georgia.gov/document/manuals/georgia-landlord-tenant-handbook-english/download' },
  { code: 'HI', name: 'Hawaii', days: 14, note: 'Itemized list and any refund are due within 14 days.', source: 'https://www.capitol.hawaii.gov/hrscurrent/Vol12_Ch0501-0588/HRS0521/HRS_0521-0044.htm' },
  { code: 'ID', name: 'Idaho', days: 21, note: 'Up to 30 days if the lease says so.', source: 'https://legislature.idaho.gov/statutesrules/idstat/title6/t6ch3/sect6-321/' },
  { code: 'IL', name: 'Illinois', days: 45, itemizedDays: 30, note: 'The statewide rule covers buildings with 5 or more units; Chicago and some other cities have their own ordinances.', source: 'https://ilga.gov/ftp/ILCS/Ch%200765/Act%200710/076507100F.html' },
  { code: 'IN', name: 'Indiana', days: 45, note: 'Itemized list and any refund are due within 45 days.', source: 'https://iga.in.gov/laws/2024/ic/titles/32#32-31-3-12' },
  { code: 'IA', name: 'Iowa', days: 30, note: 'The tenant must give a forwarding address within one year.', source: 'https://www.legis.iowa.gov/docs/code/562A.12.pdf' },
  { code: 'KS', name: 'Kansas', days: 30, note: 'Within 14 days after the landlord determines the amount, and no later than 30 days.', source: 'https://www.ksrevisor.gov/statutes/chapters/ch58/058_025_0050.html' },
  { code: 'KY', name: 'Kentucky', days: null, note: 'The statute has no single return deadline; 30 and 60 day periods apply in specific situations. Ask a local legal aid office.', source: 'https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=35733' },
  { code: 'LA', name: 'Louisiana', days: 30, note: 'One month after the lease ends; the tenant must give a forwarding address.', source: 'https://www.legis.la.gov/legis/Law.aspx?d=107468' },
  { code: 'ME', name: 'Maine', days: 30, note: '30 days for a written lease, 21 days for a tenancy at will.', source: 'https://legislature.maine.gov/statutes/14/title14sec6033.html' },
  { code: 'MD', name: 'Maryland', days: 45, note: 'Itemized list and any refund are due within 45 days.', source: 'https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=grp&section=8-203&enactments=false' },
  { code: 'MA', name: 'Massachusetts', days: 30, note: 'Itemized list, signed under penalty of perjury, and any refund are due within 30 days.', source: 'https://malegislature.gov/Laws/GeneralLaws/PartII/TitleI/Chapter186/Section15B' },
  { code: 'MI', name: 'Michigan', days: 30, note: 'The tenant must give a forwarding address within 4 days of moving out.', source: 'https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-554-609' },
  { code: 'MN', name: 'Minnesota', days: 21, note: 'Itemized list and any refund are due within 21 days.', source: 'https://www.revisor.mn.gov/statutes/cite/504B.178' },
  { code: 'MS', name: 'Mississippi', days: 45, note: 'Itemized list and any refund are due within 45 days.', source: 'https://law.justia.com/codes/mississippi/title-89/chapter-8/section-89-8-21/' },
  { code: 'MO', name: 'Missouri', days: 30, note: 'Itemized list and any refund are due within 30 days.', source: 'https://revisor.mo.gov/main/OneSection.aspx?section=535.300' },
  { code: 'MT', name: 'Montana', days: 10, itemizedDays: 30, note: '10 days if nothing is deducted; 30 days when there are deductions.', source: 'https://leg.mt.gov/bills/mca/title_0700/chapter_0250/part_0020/section_0020/0700-0250-0020-0020.html' },
  { code: 'NE', name: 'Nebraska', days: 14, note: 'Itemized list and any refund are due within 14 days.', source: 'https://nebraskalegislature.gov/laws/statutes.php?statute=76-1416' },
  { code: 'NV', name: 'Nevada', days: 30, note: 'Itemized list and any refund are due within 30 days.', source: 'https://www.leg.state.nv.us/NRS/NRS-118A.html#NRS118ASec242' },
  { code: 'NH', name: 'New Hampshire', days: 30, note: 'Shared-facility owner-occupied units may differ.', source: 'https://www.gencourt.state.nh.us/rsa/html/LV/540-A/540-A-7.htm' },
  { code: 'NJ', name: 'New Jersey', days: 30, note: '5 business days after a fire, flood or similar displacement.', source: 'https://www.nj.gov/dca/codes/publications/pdf_lti/t_i_r.pdf' },
  { code: 'NM', name: 'New Mexico', days: 30, note: 'Itemized list and any refund are due within 30 days.', source: 'https://www.rld.nm.gov/wp-content/uploads/2021/06/00-2019-NM-UORRA-CHAPTER-47-for-web-publication.pdf' },
  { code: 'NY', name: 'New York', days: 14, note: 'Itemized statement and any refund are due within 14 days.', source: 'https://www.nysenate.gov/legislation/laws/GOB/7-108' },
  { code: 'NC', name: 'North Carolina', days: 30, note: 'Up to 60 days if the landlord sends an interim accounting within 30 days.', source: 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_42/GS_42-52.html' },
  { code: 'ND', name: 'North Dakota', days: 30, note: 'Itemized list and any refund are due within 30 days.', source: 'https://ndlegis.gov/cencode/t47c16.pdf' },
  { code: 'OH', name: 'Ohio', days: 30, note: 'The tenant must give a forwarding address in writing.', source: 'https://codes.ohio.gov/ohio-revised-code/section-5321.16' },
  { code: 'OK', name: 'Oklahoma', days: 45, note: 'Counted from the tenant\'s written demand for the deposit, which must be made within 6 months.', source: 'https://www.oscn.net/applications/oscn/deliverdocument.asp?citeID=71764' },
  { code: 'OR', name: 'Oregon', days: 31, note: 'Itemized list and any refund are due within 31 days.', source: 'https://www.oregonlegislature.gov/bills_laws/ors/ors090.html' },
  { code: 'PA', name: 'Pennsylvania', days: 30, note: 'The tenant must give a forwarding address in writing.', source: 'https://www.attorneygeneral.gov/wp-content/uploads/ConsumerTenant-Landlord-Guide.pdf' },
  { code: 'RI', name: 'Rhode Island', days: 20, note: 'Itemized list and any refund are due within 20 days.', source: 'https://webserver.rilegislature.gov/Statutes/TITLE34/34-18/34-18-19.htm' },
  { code: 'SC', name: 'South Carolina', days: 30, note: 'Itemized list and any refund are due within 30 days.', source: 'https://www.scstatehouse.gov/code/t27c040.php' },
  { code: 'SD', name: 'South Dakota', days: 14, itemizedDays: 45, note: '2 weeks to return the deposit; up to 45 days for an itemized list if the tenant asks.', source: 'https://sdlegislature.gov/Statutes/43-32-24' },
  { code: 'TN', name: 'Tennessee', days: null, note: 'The statute sets no single return deadline and only applies in larger counties. Ask a local legal aid office.', source: 'https://www.tn.gov/content/dam/tn/health/documents/healthy-places/healthy-homes/HHW_LAS_TN_URLTA_Renters_Rights.pdf' },
  { code: 'TX', name: 'Texas', days: 30, note: 'The tenant must give a forwarding address in writing.', source: 'https://statutes.capitol.texas.gov/Docs/PR/htm/PR.92.htm#92.103' },
  { code: 'UT', name: 'Utah', days: 30, note: 'Itemized list and any refund are due within 30 days.', source: 'https://le.utah.gov/xcode/Title57/Chapter17/57-17-S3.html' },
  { code: 'VT', name: 'Vermont', days: 14, note: '60 days for seasonal rentals.', source: 'https://legislature.vermont.gov/statutes/section/09/137/04461' },
  { code: 'VA', name: 'Virginia', days: 45, note: 'Itemized list and any refund are due within 45 days.', source: 'https://law.lis.virginia.gov/vacode/title55.1/chapter12/section55.1-1226/' },
  { code: 'WA', name: 'Washington', days: 30, note: 'Full statement and any refund are due within 30 days.', source: 'https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.280' },
  { code: 'WV', name: 'West Virginia', days: 60, note: '60 days, or 45 days after a new tenant moves in, whichever is sooner.', source: 'https://code.wvlegislature.gov/37-6A-3/' },
  { code: 'WI', name: 'Wisconsin', days: 21, note: 'Itemized list and any refund are due within 21 days.', source: 'https://docs.legis.wisconsin.gov/statutes/statutes/704/28' },
  { code: 'WY', name: 'Wyoming', days: 30, note: '30 days, or 15 days after receiving the forwarding address, whichever is later; longer when there is damage.', source: 'https://wyoleg.gov/statutes/compress/title01.pdf' },
];

export function lookupDepositDeadline(code: string): DepositDeadline | undefined {
  const c = code.trim().toUpperCase();
  return DEPOSIT_DEADLINES.find((d) => d.code === c);
}

/** The return-by date: `days` calendar days after move-out, at local midnight. */
export function depositDueDate(moveOutDate: number, days: number): number {
  const d = new Date(moveOutDate);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/** The plain-language line shown in the app and the comparison PDF (source link and disclaimer added by the caller). */
export function depositSummary(row: DepositDeadline): string {
  if (row.days == null) return `In ${row.name}, there is no simple deposit-return deadline. ${row.note}`;
  const itemized = row.itemizedDays ? ` They have ${row.itemizedDays} days to send an itemized list of deductions.` : '';
  return `In ${row.name}, landlords generally have ${row.days} days after move-out to return the deposit.${itemized} ${row.note}`;
}
