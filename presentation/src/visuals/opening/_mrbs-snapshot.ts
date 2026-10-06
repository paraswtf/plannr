/**
 * time-table.sicsr.ac.in, copied: the college's MRBS day view for Tuesday
 * 6 October 2026, the page the bare address redirects to. It is rebuilt from
 * that page's own markup and stylesheet, so it renders the way the site does:
 * 13px Arial, the booking colours, names cut off mid-word in 59px columns,
 * and the hover (the browser's own tooltip with the full class name and
 * faculty, the empty slot and its time going pink).
 *
 * Changed from the original, on purpose:
 * - Links keep their look but lose their address: `href` became a bare
 *   `data-href`, and the stylesheet's `a:link` became `a[data-href]` (its
 *   `a:visited` rules, which only repeat them, are dropped). Hovering one
 *   shows no URL, and nothing can navigate away from the deck. MrbsPage
 *   also swallows clicks, focus and submits.
 * - Scripts and hidden inputs are gone. What is left is the page as it
 *   stands once its own script has run (the date selects replaced by a text
 *   field, the "goto" button shown).
 * - The stylesheet keeps only the rules that reach this page: general, the
 *   day view, the banner, the mini calendars, the colour key, the trailer.
 *
 * The rooms, bookings and booking types are the page's own, as published.
 * The builders below put them back into the page's structure; drawn into a
 * 1440 × 1146 window, the copy matches the live page pixel for pixel, and in
 * a phone's 980px window it lays out as the site does on a phone.
 */

/** The window the page is drawn for, in the page's own CSS pixels. */
export const VIEW = { width: 1440, height: 1146 } as const;

/**
 * Where things fall on the page in that window, measured in Chrome, in page
 * pixels. The table's rows are 18px from 07:30; its columns share the width.
 */
export const LAYOUT = {
  width: 1440,
  bannerBottom: 74.34,
  tableTop: 286.28,
  headBottom: 316.28,
  rowH: 18,
  tableLeft: 26,
  /** The left edge of the first room column, and the table's right edge. */
  roomsLeft: 62.5,
  tableRight: 1414,
  colour: { x: 26, y: 830.28, w: 1216, h: 133 },
  /** The bottom of the last line of the trailer, the page's end. */
  end: 1057,
} as const;

/**
 * The same, as a phone lays the page out. It has no viewport tag, so a phone
 * browser gives it a 980px-wide window and shrinks that to the screen: the
 * banner's title wraps, and every column loses a third of its width.
 */
export const PHONE_LAYOUT = {
  width: 980,
  bannerBottom: 89.34,
  tableTop: 301.28,
  headBottom: 331.28,
  rowH: 18,
  tableLeft: 26,
  roomsLeft: 62.55,
  tableRight: 954,
  colour: { x: 26, y: 845.28, w: 928, h: 133 },
  end: 1072,
} as const;

type Layout = typeof LAYOUT | typeof PHONE_LAYOUT;

/** [letter, name, colour]: MRBS keys a booking's type, and its colour, by letter. */
// prettier-ignore
const TYPES: readonly (readonly [string, string, string | null])[] = [
  ["A", "BCA (VII) - Honours Div. A", "#cc0066"],
  ["B", "BCA (VII) - Honours Div. B", "#ff007f"],
  ["C", "BCA (VII) - Honours Div. C", "#ff3399"],
  ["D", "BCA (VII) - Major Courses", "#ff66b2"],
  ["E", "BCA (VII) - Minor Courses", "#ff99cc"],
  ["F", "BCA (VII) - Honours with Research", "#ff00ff"],
  ["G", "BCA (V) - Div. A", "#ff66ff"],
  ["H", "BCA (V) - Div. B", "#ff99ff"],
  ["I", "BCA (V) - Div. C", "#ffccff"],
  ["J", "BCA (V) - Div. D", "#9933ff"],
  ["K", "BCA (V) - Major Courses", "#b266ff"],
  ["L", "BCA (V) - Minor Courses", "#3333ff"],
  ["M", "BCA (III) - Div. A", "#e5ccff"],
  ["N", "BCA (III) - Div. B", "#9999ff"],
  ["O", "BCA (III) - Div. C", "#ccccff"],
  ["P", "BBA-IT (VII) - Div. A", "#0066cc"],
  ["Q", "BBA-IT (VII) - Div. B", "#0080ff"],
  ["R", "BBA-IT (VII) - Minor Courses", "#99ccff"],
  ["S", "BBA-IT (VII) - Honours with Research", "#3399ff"],
  ["T", "BBA-IT (V) - Div. A", "#66b2ff"],
  ["U", "BBA-IT (V) - Div. B", "#00cccc"],
  ["V", "BBA-IT (V) - Div. C", "#33ffff"],
  ["W", "BBA-IT (V) - Minor Courses", "#99ffff"],
  ["X", "BBA-IT (III) - Div. A", "#00994c"],
  ["Y", "BBA-IT (III) - Div. B", "#00cc66"],
  ["Z", "BCA (I) - Div. A", "#00ff80"],
  ["a", "BCA (I) - Div. B", "#99ffcc"],
  ["b", "BCA (I) - Div. C", "#33ff99"],
  ["c", "BBA-IT (I) - Div. A", "#66ffb2"],
  ["d", "BBA-IT (I) - Div. B", "#ffff66"],
  ["e", "BBA-IT (I) - Div. C", "#ffff99"],
  ["f", "MSC-CA (III)", "#ffffcc"],
  ["g", "MBA-IT (III) - Div. A", "#ff9933"],
  ["h", "MBA-IT (III) - DA - Elective", "#ffb266"],
  ["i", "MBA-IT (III) - ITIM - Elective", "#999900"],
  ["j", "MBA-DT (I)", "#66cc00"],
  ["k", "MBA-IT (I)", "#994c00"],
  ["l", "MBA-IT (III)", "#808080"],
  ["m", "MBA-IT (III) - BFM", "#ff0000"],
  ["n", "MBA-IT (III) - DA", "#006633"],
  ["o", "MBA-DT (I)", "#ffe5cc"],
  ["p", "MBA-DT (III)", "#f7cdb1"],
  ["q", "MBA-DT (III) - Elective", "#ff9999"],
  ["r", "MSc-CA (I)", "#6666ff"],
  ["s", "MSc-CA (III)", "#9999ff"],
  ["t", "MSc-CA (III) - CS", "#ff99cc"],
  ["u", "MSc-CA (III) - DS", "#ffcce5"],
  ["v", "Guest Lecture", "#99ccff"],
  ["w", "EXAM", "#cce5ff"],
  ["x", "Meetups", "#ccffff"],
  // The site has no colour for this one, so its bookings show the page.
  ["y", "Common Batch", null],
  ["z", "BREAK", "#5fed21"],
];

/** [name, kind]: the kind is the second line of the header's tooltip. */
// prettier-ignore
const ROOMS: readonly (readonly [string, string])[] = [
  ["203 (24)", "Lab"],
  ["207 (52)", "Lab"],
  ["301 (50)", "Class Room"],
  ["303 (48)", "Class Room"],
  ["304 (50)", "Class Room"],
  ["305 (48)", "Class Room"],
  ["306 (48)", "Class Room"],
  ["307 (75)", "Lab"],
  ["401 (46)", "Class Room"],
  ["402 (28)", "Class Room"],
  ["404 (30)", "Lab"],
  ["405 (40)", "Class Room"],
  ["406 (40)", "Class Room"],
  ["407 (100)", "AV Hall"],
  ["701 (46)", "Class Room"],
  ["702 (44)", "Class Room"],
  ["703 (21)", "Lab"],
  ["704 (50)", "Class Room"],
  ["705 (34)", "Class Room"],
  ["706 (40)", "Class Room"],
  ["707 (90)", "AV Hall"],
  ["SDRC (15)", "Faculty Room"],
  ["Terrace", "Terrace"],
];

/**
 * [room, start, half-hours, type, tooltip, extra]. The tooltip is the full
 * entry; the cell shows the booking's name, which is usually the same text
 * (`text` when it is not: the site cuts names at 80 characters). `once`
 * marks a booking that is not part of a series, so it has no repeat icon.
 */
type Booking = readonly [
  room: string,
  start: string,
  slots: number,
  type: string,
  title: string,
  extra?: { readonly text?: string; readonly once?: true },
];

// prettier-ignore
export const BOOKINGS: readonly Booking[] = [
  ["203 (24)", "10:30", 2, "X", "BBA(IT) III- DIV A -Human Resource Management -Dr. Madhu Arora"],
  ["203 (24)", "11:30", 2, "X", "BBA(IT) III- DIV A -Human Resource Management -Dr. Madhu Arora"],
  ["203 (24)", "13:30", 2, "Y", "BBA(IT) III- DIV  B Human Resource Management -Dr. Madhu Arora"],
  ["203 (24)", "14:30", 2, "Y", "BBA(IT) III- DIV  B Human Resource Management -Dr. Madhu Arora"],
  ["207 (52)", "09:00", 2, "P", "B.B.A (IT) - VII- DIV A - Cryptography- Mrs. Surbhi Pai"],
  ["207 (52)", "10:30", 2, "P", "B.B.A (IT) - VII- DIV A - Cryptography- Mrs. Surbhi Pai"],
  ["207 (52)", "11:30", 2, "P", "B.B.A (IT) - VII- DIV A - Information Technology Regulatory Compliance- Gauri Josh", { text: "B.B.A (IT) - VII- DIV A - Information Technology Regulatory Compliance- Gauri Jo" }],
  ["207 (52)", "12:30", 2, "P", "B.B.A (IT) - VII- DIV A - Information Technology Regulatory Compliance- Gauri Josh", { text: "B.B.A (IT) - VII- DIV A - Information Technology Regulatory Compliance- Gauri Jo" }],
  ["207 (52)", "13:30", 2, "K", "BCA Sem V (AIML) - Machine Learning - Group 1 - Dr. Sandeep Gaikwad"],
  ["207 (52)", "14:30", 2, "K", "BCA Sem V (AIML) - Machine Learning - Group 1 - Dr. Sandeep Gaikwad"],
  ["207 (52)", "15:30", 2, "y", "BCA + BBA(IT) Sem VII - R Programming - Dr. Prafulla Bafna"],
  ["207 (52)", "16:30", 2, "y", "BCA + BBA(IT) Sem VII - R Programming - Dr. Prafulla Bafna"],
  ["207 (52)", "17:30", 2, "y", "BCA + BBA(IT) Sem VII - R Programming - Dr. Prafulla Bafna"],
  ["301 (50)", "09:00", 2, "X", "BBA(IT) III- DIV A- Creativity and Innovation- Ms.Mrinmayi Huprikar"],
  ["301 (50)", "11:30", 4, "d", "B.B.A. (IT) I -DIV  B -Communication Skills - Dr Shraddha Joshi", { once: true }],
  ["301 (50)", "13:30", 2, "T", "B.B.A. (IT) V - DIV A - Advanced Financial Management- Mr.Rohan Bhase"],
  ["301 (50)", "14:30", 2, "T", "B.B.A. (IT) V - DIV A - Advanced Financial Management- Mr.Rohan Bhase"],
  ["301 (50)", "16:00", 4, "O", "Extra Lecture : BCA Sem III Div C : BMC - Dipti Madam", { once: true }],
  ["303 (48)", "08:00", 2, "G", "BCA Sem V Div A - Research Methodology - Mr. Arun Kumar"],
  ["303 (48)", "09:00", 2, "G", "BCA Sem V Div A - Research Methodology - Mr. Arun Kumar"],
  ["303 (48)", "10:30", 2, "U", "B.B.A. (IT) V- DIV B- Research Methodology Dr. Sarika Gunjan Sharma"],
  ["303 (48)", "11:30", 2, "G", "BCA Sem V Div A - Lean Startup - Ms. Sayali Bedre"],
  ["303 (48)", "13:30", 2, "K", "BCA Sem V (DS) - Data Science I - Dr. Shilpa Sardesai"],
  ["303 (48)", "14:30", 2, "K", "BCA Sem V (DS) - Data Science I - Dr. Shilpa Sardesai"],
  ["303 (48)", "15:30", 2, "Y", "BBA(IT) III- DIV B-Human Resource Management -Dr. Madhu Arora", { text: "BBA(IT) III- DIV B -Human Resource Management -Dr. Madhu Arora", once: true }],
  ["304 (50)", "08:00", 2, "U", "B.B.A. (IT) V - DIV B Business Taxation and Law - Amruta Belhekar"],
  ["304 (50)", "09:00", 2, "U", "B.B.A. (IT) V - DIV B Business Taxation and Law - Amruta Belhekar"],
  ["304 (50)", "10:30", 2, "T", "B.B.A. (IT) V- DIV - A  -Marketing in Emerging Economies -Satyajit wale"],
  ["304 (50)", "11:30", 2, "T", "B.B.A. (IT) V- DIV - A  -Marketing in Emerging Economies -Satyajit wale"],
  ["304 (50)", "13:30", 2, "K", "BCA Sem V (AIML) - Introduction to Artificial Intelligence - Group 2 - Dr. Shraddha Vaidya", { text: "BCA Sem V (AIML) - Introduction to Artificial Intelligence - Group 2 - Dr. Shrad" }],
  ["304 (50)", "14:30", 2, "K", "BCA Sem V (AIML) - Introduction to Artificial Intelligence - Group 2 - Dr. Shraddha Vaidya", { text: "BCA Sem V (AIML) - Introduction to Artificial Intelligence - Group 2 - Dr. Shrad" }],
  ["305 (48)", "09:00", 2, "I", "BCA Sem V Div C - Lean Startup - Ms. Sayali Bedre"],
  ["305 (48)", "10:30", 2, "I", "BCA Sem V Div C - Lean Startup - Ms. Sayali Bedre"],
  ["305 (48)", "11:30", 2, "O", "BCA Sem III Div C - Network Essentials - Ms. Poonam Ghule"],
  ["305 (48)", "13:30", 2, "K", "BCA Sem V (DSc) - Introduction to Vulnerability Assessment Penetration Testing - Mr. Nandkumar Khachane", { text: "BCA Sem V (DSc) - Introduction to Vulnerability Assessment Penetration Testing -" }],
  ["305 (48)", "14:30", 2, "K", "BCA Sem V (DSc) - Introduction to Vulnerability Assessment Penetration Testing - Mr. Nandkumar Khachane", { text: "BCA Sem V (DSc) - Introduction to Vulnerability Assessment Penetration Testing -" }],
  ["306 (48)", "08:00", 2, "Z", "BCA Sem I Div A - Innovation Management and New Product Developement - Dr. Hema Gaikwad", { text: "BCA Sem I Div A - Innovation Management and New Product Developement - Dr. Hema" }],
  ["306 (48)", "09:00", 2, "Z", "BCA Sem I Div A - Innovation Management and New Product Developement - Dr. Hema Gaikwad", { text: "BCA Sem I Div A - Innovation Management and New Product Developement - Dr. Hema" }],
  ["306 (48)", "10:30", 2, "E", "BCA Sem VII (DA) - Database Security and Performance Tuning - Mr. Nandkumar Khachane", { text: "BCA Sem VII (DA) - Database Security and Performance Tuning - Mr. Nandkumar Khac" }],
  ["306 (48)", "11:30", 2, "E", "BCA Sem VII (DA) - Database Security and Performance Tuning - Mr. Nandkumar Khachane", { text: "BCA Sem VII (DA) - Database Security and Performance Tuning - Mr. Nandkumar Khac" }],
  ["306 (48)", "13:30", 2, "B", "BCA Sem VII Div B - Design Thinking and Problem solving - Dr. Rajashree Jain"],
  ["306 (48)", "14:30", 2, "B", "BCA Sem VII Div B - Design Thinking and Problem solving - Dr. Rajashree Jain"],
  ["307 (75)", "10:30", 2, "J", "BCA Sem V Div D - Research Methodology - Mr. Arun Kumar"],
  ["307 (75)", "11:30", 2, "J", "BCA Sem V Div D - Research Methodology - Mr. Arun Kumar"],
  ["307 (75)", "13:30", 2, "V", "B.B.A. (IT) V- DIV C- Research Methodology Dr. Sarika Gunjan Sharma"],
  ["307 (75)", "14:30", 2, "V", "B.B.A. (IT) V- DIV C- Research Methodology Dr. Sarika Gunjan Sharma"],
  ["307 (75)", "16:00", 2, "X", "B.B.A. (IT) III DIV A  Introduction to Internet of Things Gaurav Pant -", { text: "B.B.A. (IT) III DIV A  Introduction to Internet of Things Gaurav Pant" }],
  ["307 (75)", "17:00", 2, "X", "B.B.A. (IT) III DIV A  Introduction to Internet of Things Gaurav Pant"],
  ["401 (46)", "10:30", 2, "V", "B.B.A. (IT) V - DIV C Business Taxation and Law - Amruta Belhekar", { once: true }],
  ["401 (46)", "11:30", 2, "U", "B.B.A. (IT) V- DIV B- Enterprise Resource Planning - Dr. Prafulla Bharat Bafna"],
  ["401 (46)", "12:30", 2, "V", "B.B.A. (IT) V - DIV C- Advanced Financial Management- Mr.Rohan Bhase"],
  ["401 (46)", "13:30", 2, "O", "BCA Sem III Div C - Operating Systems - Dr.Shrikant Mapari"],
  ["401 (46)", "14:30", 2, "O", "BCA Sem III Div C - Operating Systems - Dr.Shrikant Mapari"],
  ["402 (28)", "10:30", 2, "E", "BCA Sem VII (SA) - Networking Monitoring and Troubleshooting - Ms. Gauri Madan"],
  ["402 (28)", "11:30", 2, "E", "BCA Sem VII (SA) - Networking Monitoring and Troubleshooting - Ms. Gauri Madan"],
  ["402 (28)", "14:30", 2, "P", "B.B.A (IT) - VII- DIV  A- Foundation Of Ethics - Dr. Shilpa Mujumdar"],
  ["402 (28)", "15:30", 2, "P", "B.B.A (IT) - VII- DIV  A- Foundation Of Ethics - Dr. Shilpa Mujumdar"],
  ["404 (30)", "10:30", 2, "Z", "BCA Sem I Div A - Introduction to Communication Skills - Ms. Sumana Chakraborty"],
  ["404 (30)", "11:30", 2, "Z", "BCA Sem I Div A - Yoga and Mental Health - Ms. Vaishali Kale"],
  ["404 (30)", "12:30", 2, "Z", "Extra Lecture : BCA Sem I Div A : Yoga and Mental Health - Vaishali Madam"],
  ["404 (30)", "13:30", 2, "c", "B.B.A. (IT) I -DIV  A -Communication Skills - Ms Meenal Deshpande"],
  ["404 (30)", "14:30", 2, "c", "B.B.A. (IT) I -DIV  A -Communication Skills - Ms Meenal Deshpande"],
  ["404 (30)", "16:00", 2, "W", "B.B.A. (IT) V- G2 B.B.A. (IT) V G2 - Fundamentals of Marketing Ketak Badgujar", { text: "B.B.A. (IT) V- G2 B.B.A. (IT) V G2 - Fundamentals Ketak Badgujar" }],
  ["404 (30)", "17:00", 2, "W", "B.B.A. (IT) V- G2 B.B.A. (IT) V G2 - Fundamentals of Marketing Ketak Badgujar", { text: "B.B.A. (IT) V- G2 B.B.A. (IT) V G2 - Fundamentals Ketak Badgujar", once: true }],
  ["405 (40)", "09:00", 2, "A", "BCA Sem VII Div A - Design Thinking and Problem solving - Dr. Rajashree Jain"],
  ["405 (40)", "10:30", 2, "c", "B.B.A. (IT) I -DIV  A -Business Modelling and Business Plan - Shatakshi Swaroop"],
  ["405 (40)", "11:30", 2, "c", "B.B.A. (IT) I -DIV  A -Business Modelling and Business Plan - Shatakshi Swaroop"],
  ["405 (40)", "13:30", 2, "a", "BCA Sem I Div B - Yoga and Mental Health - Ms. Vaishali Kale"],
  ["405 (40)", "14:30", 2, "a", "BCA Sem I Div B - Yoga and Mental Health - Ms. Vaishali Kale"],
  ["405 (40)", "16:00", 2, "c", "B.B.A. (IT) I -DIV  A -Business Accounting Gopal Phadke"],
  ["405 (40)", "17:00", 2, "c", "B.B.A. (IT) I -DIV  A -Business Accounting Gopal Phadke"],
  ["406 (40)", "09:00", 2, "c", "B.B.A. (IT) I -DIV  A -Business Modelling and Business Plan - Shatakshi Swaroop", { text: "B.B.A. (IT) I -DIV  A -Business Modelling and Business Plan - Shatakshi Sw" }],
  ["406 (40)", "10:30", 2, "a", "BCA Sem I Div B - Introduction to Python Programming - Dr. Hema Gaikwad"],
  ["406 (40)", "11:30", 2, "a", "BCA Sem I Div B - Introduction to Communication Skills - Ms Jayasree Menon"],
  ["406 (40)", "16:00", 2, "B", "BCA Sem VII Div B - Web UI and Content Management -   Mr. Shashank Gaikwad"],
  ["406 (40)", "17:00", 2, "B", "BCA Sem VII Div B - Web UI and Content Management -   Mr. Shashank Gaikwad"],
  ["407 (100)", "09:00", 2, "a", "Extra Lecture : BCA Sem I Div B : Yoga and Mental Health - Vaishali Madam"],
  ["407 (100)", "10:30", 4, "N", "Extra Lecture : BCA Sem III Div B : BMC - Dipti Madam", { once: true }],
  ["407 (100)", "13:30", 2, "X", "BBA(IT) III DIV A- Relational Database Management System - Mr. Ashish Garud", { text: "BBA(IT) III DIV A - Relational Database Management System -Mr. Ashish Garud" }],
  ["407 (100)", "14:30", 2, "X", "BBA(IT) III DIV A- Relational Database Management System - Mr. Ashish Garud", { text: "BBA(IT) III DIV A - Relational Database Management System -Mr. Ashish Garud" }],
  ["407 (100)", "16:00", 2, "d", "B.B.A. (IT) I -DIV  B -Business Modelling and Business Plan - Shatakshi Swaroop"],
  ["407 (100)", "17:00", 2, "d", "B.B.A. (IT) I -DIV  B -Business Modelling and Business Plan - Shatakshi Swaroop"],
  ["701 (46)", "10:30", 2, "Y", "BBA(IT) III-DIV  B Creativity and Innovation -Ms.Mrinmayi Huprikar"],
  ["701 (46)", "11:30", 2, "Y", "BBA(IT) III-DIV  B Creativity and Innovation -Ms.Mrinmayi Huprikar"],
  ["701 (46)", "12:30", 2, "D", "BCA Sem VII (CC) - Grid Computing and Utility computing - Mr. Saket Patrikar"],
  ["701 (46)", "16:00", 2, "N", "BCA Sem III Div B - Structured Query Language - Ms. Poonam Ghule"],
  ["702 (44)", "10:30", 2, "E", "BCA Sem VII (SD) - Advance Android Programming - Dr. Aniket Nagane"],
  ["702 (44)", "11:30", 2, "E", "BCA Sem VII (SD) - Advance Android Programming - Dr. Aniket Nagane"],
  ["702 (44)", "13:30", 2, "M", "BCA Sem III Div A - Structured Query Language - Ms. Poonam Ghule"],
  ["702 (44)", "14:30", 2, "M", "BCA Sem III Div A - Structured Query Language - Ms. Poonam Ghule"],
  ["702 (44)", "16:00", 2, "M", "BCA Sem III Div A - Operating Systems - Dr.Shrikant Mapari"],
  ["703 (21)", "10:30", 2, "G", "BCA Sem V Div A - Research Methodology - Mr. Arun Kumar", { once: true }],
  ["704 (50)", "10:30", 2, "H", "BCA Sem V Div B - Best Programming Practices - Mr. Saket Patrikar"],
  ["704 (50)", "11:30", 2, "H", "BCA Sem V Div B - Best Programming Practices - Mr. Saket Patrikar"],
  ["704 (50)", "13:30", 2, "U", "B.B.A. (IT) V -DIV B Business Analytics -Ms. Prajakta Soman"],
  ["704 (50)", "14:30", 2, "U", "B.B.A. (IT) V -DIV B Business Analytics -Ms. Prajakta Soman"],
  ["705 (34)", "08:00", 20, "w", "Term End Exam", { once: true }],
  ["706 (40)", "08:00", 20, "w", "Term End Exam", { once: true }],
  ["707 (90)", "08:00", 20, "w", "Term End Exam", { once: true }],
  ["SDRC (15)", "14:30", 2, "d", "B.B.A. (IT) I -DIV  B -Foundation Web Technology - Prakash Raut"],
];

/** The cell the "desktop-sized text" callout rings: its faculty is cut off. */
export const PINNED = { room: "301 (50)", start: "11:30" } as const;

/** The half-hours down the side, 07:30 to 20:30. */
const TIMES = Array.from({ length: 27 }, (_, i) => {
  const minutes = 7 * 60 + 30 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

/** A booking's cell, in page pixels, on the desktop or (`PHONE_LAYOUT`) a phone. */
export function cellRect(room: string, start: string, layout: Layout = LAYOUT) {
  const col = ROOMS.findIndex(([name]) => name === room);
  const row = TIMES.indexOf(start);
  const booking = BOOKINGS.find(([r, s]) => r === room && s === start);
  const colW = (layout.tableRight - layout.roomsLeft) / ROOMS.length;
  return {
    x: layout.roomsLeft + col * colW,
    y: layout.headBottom + row * layout.rowH,
    w: colW,
    h: (booking?.[2] ?? 1) * layout.rowH,
  };
}

/** The day this copy shows. */
const DAY = { year: 2026, month: 10, day: 6 } as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** The repeat icon MRBS puts on every booking in a series (images/repeat.png). */
const REPEAT =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAAOwwAADsMBx2+oZAAAAAd0SU1FB9oJGA4pAkcaWyUAAAFVSURBVBjTLcG9a1NRHMfhz/ece5N7k7ZmsEVcFFwc6lAEp1INSCkIXWpAKLi4uyr4N0gHZwdXDS4OohmiCA4i/gEO0kmEokibl/tyzvm5+DwC6A1HfeCJSQ+EFWb6bGZHhVWTRt1LSBfUG46cmX1X0bsCiVwt/RhIBn+D/yK4KkuHDrMteX/ZQos17ft6EZ/NomJBYMPXNy6qWosoOuCcxRR9N5/QKQ+rj+OHIWrwq+3MkQMnDFJm8I3VtfXZm+en/Gfwwsv6Z8FhODzkKm+NbneVJgIaRDJ9Wn54tVMO72o5Hdtg796grkLuIoTzvmUlS0TTQtg+wHI6tpU799/WZK+B6xkgM+FlbORt73fqnJQ3D57K55uxDXsKAdDjLJPpZ+zMLOl41cfNMiNb5MUjM4cEpOaHia8OdCrZdjV9ee0suN15yztrwlyh+UNdHZm0tZyO0z98paHlTDbvvwAAAABJRU5ErkJggg==";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** A link with nowhere to go: styled as one, cannot navigate. */
const link = (html: string, attrs = "") => `<a data-href${attrs}>${html}</a>`;

const two = (n: number) => String(n).padStart(2, "0");
const utc = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d));
const short = (date: Date) =>
  `${MONTHS[date.getUTCMonth()]!.slice(0, 3)} ${two(date.getUTCDate())}`;

function banner() {
  const date = `${two(DAY.month)}/${two(DAY.day)}/${DAY.year}`;
  return `<header class="banner"><nav><ul>
<li><div id="company"><div id="logo">${link("<span>Symbiosis Institute of Computer Studies and Research</span>")}</div><div id="mrbs">${link("Time Table")}</div></div></li>
<li><form id="Form1"><span><input class="date" type="text" value="${date}"></span> <input type="submit" value="goto"></form></li>
<li>${link("Help")}</li>
<li>${link("Rooms")}</li>
<li>${link("Report")}</li>
<li><form id="header_search"><div>${link("Search:")} <input type="search" value=""></div></form></li>
<li><div id="logon_box">${link("Unknown user")}<form><div><input type="submit" value=" Log in "></div></form>${link("User list", ' id="user_list_link"')}</div></li>
</ul></nav></header>`;
}

/** One of the three month calendars at the top right. */
function calendar(year: number, month: number, today?: number) {
  const first = utc(year, month, 1).getUTCDay();
  const days = utc(year, month + 1, 0).getUTCDate();
  const cells: (number | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) =>
    cells
      .slice(w * 7, w * 7 + 7)
      .map((d) =>
        d === null
          ? "<td>&nbsp;</td>"
          : d === today
            ? `<td id="sticky_day">${link(String(d), ' class="current"')}</td>`
            : `<td>${link(String(d))}</td>`,
      )
      .join(""),
  );
  return `<table class="calendar"><thead><tr><th colspan="7">${link(`${MONTHS[month - 1]}&nbsp;${year}`)}</th></tr><tr>${WEEKDAYS.map((d) => `<th>${d.slice(0, 3)}</th>`).join("")}</tr></thead><tbody>${weeks.map((w) => `<tr>${w}</tr>`).join("")}</tbody></table>`;
}

function dateNav() {
  return `<nav class="date_nav">${link("Go To Day Before", ' class="date_before"')}${link("Go To Today", ' class="date_now"')}${link("Go To Day After", ' class="date_after"')}</nav>`;
}

function dayTable() {
  const width = (99 / ROOMS.length).toFixed(6);
  const head = ROOMS.map(
    ([name, kind]) =>
      `<th style="width: ${width}%">${link(name, ` title="View Week &#10;&#10;${kind}"`)}</th>`,
  ).join("");

  // Where each booking starts, and the slots below it that its rowspan fills.
  const starts = new Map<string, Booking>();
  const covered = new Set<string>();
  for (const b of BOOKINGS) {
    const col = ROOMS.findIndex(([name]) => name === b[0]);
    const row = TIMES.indexOf(b[1]);
    starts.set(`${row}:${col}`, b);
    for (let k = 1; k < b[2]; k++) covered.add(`${row + k}:${col}`);
  }

  const rows = TIMES.map((time, row) => {
    const cells = ROOMS.map((_, col) => {
      const key = `${row}:${col}`;
      if (covered.has(key)) return "";
      const b = starts.get(key);
      if (!b)
        return `<td class="new"><div class="celldiv slots1">${link("")}</div></td>`;
      const [, , slots, type, title, extra] = b;
      const icon = extra?.once
        ? ""
        : `<img class="repeat_symbol ${type}" src="${REPEAT}" alt="Series" title="Series" width="10" height="10">`;
      return `<td class="${type}" rowspan="${slots}"><div class="celldiv slots${slots}">${link(icon + esc(extra?.text ?? title), ` title="${esc(title)}"`)}</div></td>`;
    }).join("");
    return `<tr class="${row % 2 ? "odd_row" : "even_row"}"><td class="row_labels"><div class="celldiv slots1">${link(time, ' title="Highlight this line"')}</div></td>${cells}</tr>`;
  }).join("\n");

  return `<table class="dwm_main" id="day_main"><thead><tr><th class="first_last" style="width: 1%">Time:</th>${head}</tr></thead><tbody>
${rows}
</tbody></table>`;
}

function colourKey() {
  const cells = TYPES.map(
    ([key, name]) =>
      `<td class="${key}"><div class="celldiv slots1" title="${esc(name)}">${esc(name)}</div></td>`,
  );
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 9) {
    const row = cells.slice(i, i + 9);
    if (row.length < 9)
      row.push(`<td colspan="${9 - row.length}" id="row_padding">&nbsp;</td>`);
    rows.push(`<tr>${row.join("")}</tr>`);
  }
  return `<table id="colour_key"><tbody>${rows.join("\n")}</tbody></table>`;
}

/** "View Day / Week / Month": a run of links around the current one. */
function trailer() {
  const run = (labels: string[], current: number, wrap: boolean) =>
    labels
      .map((label, i) => {
        const a = link(label);
        if (i === current) return `<span class="current">[ ${a} ]</span>`;
        return wrap ? `<span>${a}</span>` : a;
      })
      .join(" | ");
  const day = utc(DAY.year, DAY.month, DAY.day);
  const offset = (d: Date, days: number) =>
    utc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate() + days);
  const days = Array.from({ length: 14 }, (_, i) => short(offset(day, i - 6)));
  const sunday = offset(day, -day.getUTCDay());
  const weeks = Array.from({ length: 9 }, (_, i) =>
    short(offset(sunday, (i - 4) * 7)),
  );
  const months = Array.from({ length: 9 }, (_, i) => {
    const m = utc(DAY.year, DAY.month + i - 2, 1);
    return `${MONTHS[m.getUTCMonth()]!.slice(0, 3)} ${m.getUTCFullYear()}`;
  });
  const section = (id: string, label: string, links: string) =>
    `<div id="${id}"><div class="trailer_label">${link(label)}</div><div class="trailer_links">${links}</div></div>`;
  return `<div class="screenonly trailer" id="trailer">${section("viewday", "View Day:", run(days, 6, true))}${section("viewweek", "View Week:", run(weeks, 4, false))}${section("viewmonth", "View Month:", run(months, 2, false))}</div>`;
}

/** The page's body, as markup. */
export function mrbsHtml() {
  const date = utc(DAY.year, DAY.month, DAY.day);
  const options = TYPES.map(
    ([key, name]) => `<option value="${key}">${esc(name)}</option>`,
  ).join("");
  return `<div class="mrbs-body day js">
${banner()}
<div id="contents">
<div id="dwm_header" class="screenonly"><nav id="cals"><div id="cal_last">${calendar(DAY.year, DAY.month - 1)}</div><div id="cal_this">${calendar(DAY.year, DAY.month, DAY.day)}</div><div id="cal_next">${calendar(DAY.year, DAY.month + 1)}</div></nav></div>
<div id="div_type"><form id="sorttype"><label for="type">Type:</label>
<select id="type">${options}</select>
<input type="submit" value="Submit"></form></div>
<div id="dwm"><h2>${WEEKDAYS[date.getUTCDay()]} ${two(DAY.day)} ${MONTHS[DAY.month - 1]} ${DAY.year}</h2></div>
${dateNav()}
${dayTable()}
${dateNav()}
${colourKey()}
</div>${trailer()}
</div>`;
}

/**
 * The site's stylesheet (css/mrbs.css.php), cut to the rules this page uses.
 * The :host rule stands in for a fresh window: no styles from the deck.
 */
export const MRBS_CSS = String.raw`
:host {
  all: initial;
  display: block;
  overflow: hidden;
  background-color: #e7ebee;
}

/* What the browser gives any link. */
a[data-href] {cursor: pointer}

/* ------------ GENERAL -----------------------------*/

.mrbs-body {
  font-size: small;
  margin: 0;
  padding: 0;
  color:            #0B263B;
  font-family:      Arial, 'Arial Unicode MS', Verdana, sans-serif;
  background-color: #e7ebee;
}

.current {color: #ff0066}

div#contents, div.trailer {
  float: left;
  width: 100%;
  box-sizing: border-box;
  padding: 0 2em;
}

h2 {font-size: large; clear: both}

img {border: 0}

a[data-href] {color: #0B263B;    text-decoration: none; font-weight: bold}
a:hover   {color: #ff0066;   text-decoration: underline; font-weight: bold}

tr.even_row td.new {background-color: #ffffff}
tr.odd_row td.new {background-color: #f2f4f6}

td, th {vertical-align: top}

td form {margin: 0}

/* ------------ DAY/WEEK/MONTH.PHP ------------------*/

div#dwm_header {width: 100%; float: left; margin-top: 1.0em; margin-bottom: 0.5em}

div#dwm {margin-bottom: 0.5em}
#dwm {text-align: center}
#dwm h2 {margin-bottom: 0}

.date_nav {
  float: left;
  width: 100%;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  font-weight: bold
}

.date_nav a {
  display: block;
  width: 33%;
}

.date_before {
  float: left;
  text-align: left;
}

.date_now {
  float: left;
  text-align: center;
}

.date_after {
  float: right;
  text-align: right;
}

.date_before:before {
  content: '<<\0000a0';
}

.date_after:after {
  content: '\0000a0>>';
}

table.dwm_main {
  float: left;
  clear: both;
  width: 100%;
  border-spacing: 0;
  border-collapse: separate;
  border-color: #e7ebee;
  border-width: 0px;
  border-style: solid
}

.dwm_main td {padding: 0;
    border-top:  1px solid #ffffff;
    border-left: 1px solid #e7ebee;
    border-bottom: 0;
    border-right: 0}
.dwm_main td:first-child {border-left: 0}
.dwm_main th {font-size: small; font-weight: normal; vertical-align: top; padding: 0;
    color: #ffffff;
    background-color: #4b667b;
    border-left: 1px solid #e7ebee}
.dwm_main th.first_last, .dwm_main th span {padding: 0 2px}
.dwm_main th:first-child {border-left: 0}

.dwm_main a {
  display: block;
  min-height: inherit;
  word-wrap: break-word;
  word-break: break-all;
}

.dwm_main tbody a {padding: 0 2px}
.dwm_main th a[data-href] {color: #ffffff;    text-decoration: none; font-weight: normal}
.dwm_main th a:hover   {color: #ffffff;   text-decoration:underline; font-weight: normal}

td.new a {display: block; font-size: medium; text-align: center}
img.repeat_symbol {float: right; padding: 3px}

${TYPES.flatMap(([key, , colour]) => (colour ? [`.${key} {background-color: ${colour}}`] : [])).join("\n")}

.dwm_main td.row_labels     {background-color: #4b667b; white-space: nowrap}
.row_labels a[data-href] {color: #ffffff;    text-decoration: none; font-weight: normal}
.row_labels a:hover   {color: #ffffff;   text-decoration: underline; font-weight: normal}

.dwm_main td:hover.new {background-color: #ffc0da}
.dwm_main tr:hover td.row_labels {background-color: #ffc0da; color: #0B263B}

.dwm_main tbody tr:hover a[data-href] {color: #0B263B}

${TIMES.map((_, i) => `div.slots${i + 1} {min-height: ${18 * i + 17}px; max-height: ${18 * i + 17}px; height: ${18 * i + 17}px}`).join("\n")}
div.celldiv {max-width: 100%; overflow: hidden; margin: 0; padding: 0}
.row_labels div.celldiv {overflow: visible}

/* ------------ FUNCTIONS.INC -------------------*/

.banner {
  height: 100%;
  width: 100%;
  background-color: #4b667b;
  color: #ffffff;
  border-color: #e7ebee;
  border-width: 0px;
  border-style: solid;
}

.banner #company {
  font-size: large;
  padding: 0.3em 1em;
  text-align: center;
  vertical-align: middle;
}

.banner #company div {
  width: 100%;
}

.banner nav {
  display: table;
  height: 100%;
  width: 100%;
}

.banner ul {
  list-style: none;
  display: table;
  width: 100%;
  height: 100%;
  margin: 0;
  padding-left: 0;
}

.banner li {
  display: table-cell;
  height: 100%;
  text-align: center;
  vertical-align: middle;
  border-color: #e7ebee;
  border-style: solid;
  border-width: 0 0 0 1px;
  padding: 0.3em 0.5em;
}

.banner li:first-child {
  border-left-width: 0;
}

#logon_box a {
  display: block;
  width: 100%;
  padding-top: 0.3em;
  padding-bottom: 0.3em;
}

.banner a[data-href], .banner a:hover {
  text-decoration: none;
  font-weight: normal;
}

.banner a[data-href] {
  color: #ffffff;
}

.banner a:hover {
  color: #ffffff;
}

.banner input.date {
  width: 6.5em;
  text-align: center
}

.js .banner #Form1 span {
  display: inline-block;
  min-width: 7.5em;
}

table#colour_key {clear: both; float: left; border-spacing: 0; border-collapse: collapse; margin-bottom: 0.5em}
#colour_key td {width: 10.0em; padding: 2px; font-weight: bold;
    color: #0B263B;
    border: 1px solid #ffffff}
#colour_key td#row_padding {border-right: 0; border-bottom: 0}
#header_search input {width: 6.0em}

/* ------------ MINCALS.PHP ---------------------*/
#cals {float: right}
div#cal_last {float: left}
div#cal_this {float: left; margin-left: 1.0em}
div#cal_next {float: left; margin-left: 1.0em}

table.calendar {border-spacing: 0; border-collapse: collapse}
.calendar th {min-width: 2.0em; text-align: center; font-weight: normal; background-color: transparent; color: #0B263B}
.calendar td {text-align: center; font-size: x-small}
.calendar a.current {font-weight: bold; color: #ff0066}
td#sticky_day {border: 1px dotted #ff0066}

/* ------------ TRAILER.INC ---------------------*/
div#trailer {border-top: 1px solid #0B263B;
             border-bottom: 1px solid #0B263B;
             float: left;
             clear: left;
             margin-top: 1.0em; margin-bottom: 1.5em;
             padding-top: 0.3em; padding-bottom: 0.3em}
#trailer div {float: left; width: 100%}
#trailer div.trailer_label {float: left; clear: left; width: 20%; max-width: 9.0em; font-weight: bold}
#trailer div.trailer_links {float: left;              width: 79%}  /* 79 to avoid rounding problems */
.trailer_label span {margin-right: 1.0em}

#trailer span.current {font-weight: bold}
#trailer .current a {color: #ff0066}
`;
