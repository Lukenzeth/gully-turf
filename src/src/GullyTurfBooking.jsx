import { useState, useMemo, useCallback, useEffect, useRef } from "react";

// ╔══════════════════════════════════════════════════════════════╗
// ║  PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL BELOW            ║
// ║  (Deploy > New Deployment > Web App URL)                    ║
// ╚══════════════════════════════════════════════════════════════╝
const API_URL = "https://script.google.com/macros/s/AKfycby2TAotH0dCeObudnTrqYLaVAek9ULopOTqliEvF-gdW7nZzqzTjES79Lwen1pcZdTb/exec";

const GST_RATE = 0.15;
const HALF_HOUR_RATE = 30;
const HOUR_RATE = 50;
const LIGHTING_RATE_PER_HOUR = 25;
const LIGHTING_START_HOUR = 19.5;
const ADMIN_PIN = "npbhs2024";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const SHORT_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const TERMS = [
  "All bookings must be paid prior to use of the turf.",
  "Appropriate footwear must be worn at all times — no metal studs or spikes.",
  "No food or drink (other than water) is permitted on the turf surface.",
  "The hirer is responsible for any damage caused during their booking period.",
  "Cancellations must be made at least 24 hours in advance for a full refund.",
  "Cancellations within 24 hours will forfeit the full booking fee.",
  "NPBHS reserves the right to cancel bookings for school events with 48 hours notice.",
  "All users must vacate the turf promptly at the end of their booked time.",
  "The hirer assumes all risk of injury during use of the facility.",
  "Lighting will be turned off at the conclusion of the last booking — do not remain on the turf after lights out.",
];

function isWeekend(dayIndex) { return dayIndex >= 5; }

function generateSlots(dayIndex) {
  const slots = [];
  const weekend = isWeekend(dayIndex);
  const increment = weekend ? 60 : 30;
  const startHour = weekend ? 6 : 17;
  const startMin = weekend ? 0 : 30;
  for (let hour = startHour; hour < 22; hour++) {
    for (let min = (hour === startHour ? startMin : 0); min < 60; min += increment) {
      const td = hour + min / 60;
      const ed = td + increment / 60;
      if (ed > 22) continue;
      let baseRate = increment === 30 ? HALF_HOUR_RATE : HOUR_RATE;
      let lc = 0;
      if (td >= LIGHTING_START_HOUR || ed > LIGHTING_START_HOUR) {
        const lm = Math.min(ed, 22) - Math.max(td, LIGHTING_START_HOUR);
        if (lm > 0) lc = lm * LIGHTING_RATE_PER_HOUR;
      }
      const sub = baseRate + lc, gst = sub * GST_RATE, total = sub + gst;
      slots.push({ id: `${dayIndex}-${hour}-${min}`, dayIndex, hour, min, timeDecimal: td, endDecimal: ed, duration: increment, baseRate, lightingCost: lc, needsLighting: lc > 0, subtotal: sub, gst, total, label: fmtTime(hour, min), endLabel: fmtTime(Math.floor(ed), (ed % 1) * 60) });
    }
  }
  return slots;
}

function fmtTime(h, m) {
  const p = h >= 12 ? "PM" : "AM";
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${String(Math.round(m)).padStart(2, "0")} ${p}`;
}

function getWeekDates(wo) {
  const now = new Date(), dow = now.getDay();
  const mo = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + mo + wo * 7);
  return DAYS.map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}

function fmtDate(d) { return `${d.getDate()} ${d.toLocaleString("en-NZ",{month:"short"})}`; }
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function genRef() { return "GT-" + Math.random().toString(36).substring(2,8).toUpperCase(); }

// ─── API HELPERS ───
async function apiGet(action) {
  const res = await fetch(`${API_URL}?action=${action}`);
  return res.json();
}

async function apiPost(action, body) {
  const res = await fetch(`${API_URL}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const C = {
  black:"#1a1a1a", darkBg:"#111111", cardBg:"#1a1a1a",
  gold:"#c8a84e", goldLight:"#dfc06a", goldDark:"#a08030",
  goldSubtle:"rgba(200,168,78,0.08)", goldBorder:"rgba(200,168,78,0.2)",
  goldSelected:"rgba(200,168,78,0.25)", goldSelectedBorder:"rgba(200,168,78,0.6)",
  white:"#f5f3ee", textPrimary:"#f5f3ee", textSecondary:"#a09a8c", textMuted:"#6b6560",
  red:"#c0392b", redBg:"rgba(192,57,43,0.1)", redBorder:"rgba(192,57,43,0.25)",
  blue:"#2d6da8", blueBg:"rgba(45,109,168,0.12)", blueBorder:"rgba(45,109,168,0.3)",
};

const inputStyle = { width:"100%", padding:"10px 14px", marginTop:4, borderRadius:4, border:`1px solid ${C.goldBorder}`, background:"rgba(0,0,0,0.3)", color:C.textPrimary, fontSize:14, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
const labelStyle = { fontSize:11, color:C.textMuted, fontWeight:600, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:2 };

export default function GullyTurfBooking() {
  const [page, setPage] = useState("booking");
  const [weekOffset, setWeekOffset] = useState(0);
  const [bookings, setBookings] = useState({});
  const [blockedDates, setBlockedDates] = useState({});
  const [selectedSlots, setSelectedSlots] = useState({});
  const [selectedDay, setSelectedDay] = useState(0);
  const [view, setView] = useState("week");
  const [bookingForm, setBookingForm] = useState({ name:"", email:"", phone:"", org:"" });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsDetail, setShowTermsDetail] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [manageRef, setManageRef] = useState("");
  const [manageResult, setManageResult] = useState(null);
  const [manageLooking, setManageLooking] = useState(false);

  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [adminTab, setAdminTab] = useState("bookings");
  const [blockForm, setBlockForm] = useState({ date:"", reason:"", type:"full", startTime:"", endTime:"" });

  // ─── DATA LOADING ───
  const loadData = useCallback(async (showLoader) => {
    if (showLoader) setLoading(true);
    try {
      const [bkRes, blRes] = await Promise.all([apiGet("getBookings"), apiGet("getBlocks")]);
      if (bkRes.bookings) setBookings(bkRes.bookings);
      if (blRes.blocks) setBlockedDates(blRes.blocks);
    } catch (err) {
      console.error("Failed to load data:", err);
    }
    if (showLoader) setLoading(false);
  }, []);

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => loadData(false), 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const allSlots = useMemo(() => DAYS.map((_, i) => generateSlots(i)), []);

  const selectedList = useMemo(() => Object.values(selectedSlots).sort((a,b) => a.dayIndex !== b.dayIndex ? a.dayIndex - b.dayIndex : a.timeDecimal - b.timeDecimal), [selectedSlots]);
  const selectedTotal = useMemo(() => selectedList.reduce((s,x) => s + x.total, 0), [selectedList]);
  const selectedBase = useMemo(() => selectedList.reduce((s,x) => s + x.baseRate, 0), [selectedList]);
  const selectedLighting = useMemo(() => selectedList.reduce((s,x) => s + x.lightingCost, 0), [selectedList]);
  const selectedGst = useMemo(() => selectedList.reduce((s,x) => s + x.gst, 0), [selectedList]);

  const totalSlotsCount = selectedList.length * (1 + repeatWeeks);
  const recurringMultiplier = 1 + repeatWeeks;
  const grandTotal = selectedTotal * recurringMultiplier;
  const grandBase = selectedBase * recurringMultiplier;
  const grandLighting = selectedLighting * recurringMultiplier;
  const grandGst = selectedGst * recurringMultiplier;

  const toggleSlot = useCallback((slot) => {
    setSelectedSlots(prev => {
      const copy = { ...prev };
      if (copy[slot.id]) delete copy[slot.id]; else copy[slot.id] = slot;
      return copy;
    });
  }, []);

  const isBookedForDate = (slotId, date) => bookings[`${dateKey(date)}-${slotId}`];

  const isBlockedDate = (date) => {
    const dk = dateKey(date);
    if (blockedDates[dk] && blockedDates[dk].type === "full") return blockedDates[dk];
    return null;
  };

  const isSlotBlocked = (date, slot) => {
    const dk = dateKey(date);
    if (blockedDates[dk] && blockedDates[dk].type === "full") return blockedDates[dk];
    const prefix = dk + "-";
    for (const [key, block] of Object.entries(blockedDates)) {
      if (key.startsWith(prefix) && block.type === "slots") {
        const bStart = parseFloat(block.startTime.split(":")[0]) + parseFloat(block.startTime.split(":")[1]) / 60;
        const bEnd = parseFloat(block.endTime.split(":")[0]) + parseFloat(block.endTime.split(":")[1]) / 60;
        if (slot.timeDecimal >= bStart && slot.timeDecimal < bEnd) return block;
      }
    }
    return null;
  };

  const isBooked = (slotId, dayIdx) => isBookedForDate(slotId, weekDates[dayIdx]);
  const isBlocked = (dayIdx) => isBlockedDate(weekDates[dayIdx]);
  const isSlotBlockedForDay = (dayIdx, slot) => isSlotBlocked(weekDates[dayIdx], slot);
  const isSelected = (slotId) => !!selectedSlots[slotId];
  const isPast = (dayIndex, slot) => {
    const now = new Date(), st = new Date(weekDates[dayIndex]);
    st.setHours(slot.hour, slot.min, 0, 0);
    return st < now;
  };

  // ─── BOOK ───
  const handleBook = useCallback(async () => {
    if (!bookingForm.name || !bookingForm.email || selectedList.length === 0 || !termsAccepted) return;
    setSubmitting(true);

    try {
      // Build entries for Google Sheets
      const ref = genRef();
      const entries = [];

      for (let w = 0; w <= repeatWeeks; w++) {
        const dates = getWeekDates(weekOffset + w);
        selectedList.forEach(slot => {
          const dk = dateKey(dates[slot.dayIndex]);
          const key = `${dk}-${slot.id}`;
          entries.push({
            key, ref,
            name: bookingForm.name, email: bookingForm.email,
            phone: bookingForm.phone, org: bookingForm.org,
            date: dates[slot.dayIndex].toISOString(), dateKey: dk,
            slotId: slot.id, startTime: slot.label, endTime: slot.endLabel,
            duration: slot.duration, baseRate: slot.baseRate,
            lightingCost: slot.lightingCost, gst: slot.gst, total: slot.total,
            bookedAt: new Date().toISOString(),
          });
        });
      }

      const result = await apiPost("addBookings", { entries });

      if (result.error === "conflict") {
        setToast({ type:"error", message:"Some slots were just booked by someone else. Please refresh and try again." });
        await loadData(false);
        setSubmitting(false);
        return;
      }

      if (result.error) {
        setToast({ type:"error", message:`Booking failed: ${result.error}` });
        setSubmitting(false);
        return;
      }

      await loadData(false);
      setShowConfirmation({ count: entries.length, total: grandTotal, ref, weeks: repeatWeeks });
      setSelectedSlots({});
      setShowModal(false);
      setBookingForm({ name:"", email:"", phone:"", org:"" });
      setTermsAccepted(false);
      setRepeatWeeks(0);
    } catch (err) {
      setToast({ type:"error", message:"Network error. Please check your connection and try again." });
    }
    setSubmitting(false);
  }, [bookingForm, selectedList, weekOffset, grandTotal, termsAccepted, repeatWeeks, loadData]);

  // ─── CANCEL ───
  const cancelBooking = async (ref) => {
    setSubmitting(true);
    try {
      const result = await apiGet(`cancelBooking&ref=${encodeURIComponent(ref)}`);
      if (result.success) {
        setToast({ type:"success", message:`Booking ${ref} has been cancelled.` });
        setManageResult(null);
        setManageRef("");
        await loadData(false);
      } else {
        setToast({ type:"error", message:"Failed to cancel booking." });
      }
    } catch { setToast({ type:"error", message:"Network error." }); }
    setSubmitting(false);
  };

  const lookupBooking = async () => {
    setManageLooking(true);
    await loadData(false);
    const found = Object.values(bookings).filter(b => b.ref === manageRef.toUpperCase().trim());
    setManageResult(found.length > 0 ? found : []);
    setManageLooking(false);
  };

  // ─── BLOCKS ───
  const addBlock = async () => {
    if (!blockForm.date) return;
    if (blockForm.type === "slots" && (!blockForm.startTime || !blockForm.endTime)) return;
    const key = blockForm.type === "full" ? blockForm.date : `${blockForm.date}-${blockForm.startTime}`;
    try {
      await apiPost("addBlock", {
        key, date: blockForm.date, type: blockForm.type,
        startTime: blockForm.startTime || "", endTime: blockForm.endTime || "",
        reason: blockForm.reason || "Blocked",
      });
      setBlockForm({ date:"", reason:"", type:"full", startTime:"", endTime:"" });
      setToast({ type:"success", message: blockForm.type === "full" ? "Full day blocked." : `Blocked ${blockForm.startTime} – ${blockForm.endTime}.` });
      await loadData(false);
    } catch { setToast({ type:"error", message:"Failed to add block." }); }
  };

  const removeBlock = async (dk) => {
    try {
      await apiGet(`removeBlock&key=${encodeURIComponent(dk)}`);
      await loadData(false);
    } catch { setToast({ type:"error", message:"Failed to remove block." }); }
  };

  const adminCancelBooking = async (ref) => {
    setSubmitting(true);
    try {
      await apiGet(`cancelBooking&ref=${encodeURIComponent(ref)}`);
      setToast({ type:"success", message:`Booking ${ref} cancelled.` });
      await loadData(false);
    } catch { setToast({ type:"error", message:"Network error." }); }
    setSubmitting(false);
  };

  const allBookingsList = useMemo(() => {
    const refs = {};
    Object.values(bookings).forEach(b => {
      if (!refs[b.ref]) refs[b.ref] = { ref: b.ref, name: b.name, email: b.email, phone: b.phone, org: b.org, slots: [], bookedAt: b.bookedAt };
      refs[b.ref].slots.push(b);
    });
    return Object.values(refs).sort((a,b) => new Date(b.bookedAt) - new Date(a.bookedAt));
  }, [bookings]);

  const btn = (active) => ({
    padding:"8px 18px", borderRadius:4, border:`1px solid ${active ? C.gold : C.goldBorder}`,
    background: active ? C.gold : "transparent", color: active ? C.black : C.textSecondary,
    fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s",
  });

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }}, [toast]);

  // ─── LOADING SCREEN ───
  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.darkBg, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@700;800&display=swap" rel="stylesheet" />
      <img src="https://npbhs2023.ibcdn.nz/media/2023_07_07_logo-transparent-bg.svg" alt="NPBHS" style={{ height:64, opacity:0.7 }} />
      <div style={{ fontSize:20, fontWeight:700, color:C.gold, fontFamily:"'Source Serif 4',Georgia,serif" }}>Loading Gully Turf...</div>
      <div style={{ width:120, height:3, background:C.goldBorder, borderRadius:2, overflow:"hidden" }}>
        <div style={{ width:"40%", height:"100%", background:C.gold, borderRadius:2, animation:"loadBar 1.2s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes loadBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
    </div>
  );

  // ─── RENDER ───
  return (
    <div style={{ minHeight:"100vh", fontFamily:"'Source Sans 3','Source Sans Pro',system-ui,sans-serif", background:C.darkBg, color:C.textPrimary, paddingBottom: selectedList.length > 0 && page === "booking" ? 80 : 0 }}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700;800;900&family=Source+Serif+4:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <header style={{ background:C.black, borderBottom:`3px solid ${C.gold}`, padding:"16px 24px" }}>
        <div style={{ maxWidth:1400, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:16, cursor:"pointer" }} onClick={() => { setPage("booking"); setAdminAuth(false); }}>
            <img src="https://npbhs2023.ibcdn.nz/media/2023_07_07_logo-transparent-bg.svg" alt="NPBHS" style={{ height:52 }} />
            <div>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:C.white, letterSpacing:-0.3, fontFamily:"'Source Serif 4',Georgia,serif" }}>Gully Turf</h1>
              <p style={{ margin:0, fontSize:11, color:C.gold, fontWeight:600, letterSpacing:3, textTransform:"uppercase" }}>Facility Booking</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <button onClick={() => setPage("booking")} style={btn(page==="booking")}>Book</button>
            <button onClick={() => setPage("manage")} style={btn(page==="manage")}>Manage Booking</button>
            <button onClick={() => setPage("admin")} style={btn(page==="admin")}>Admin</button>
            <a href="mailto:gullyturf@npbhs.school.nz" style={{ color:C.gold, textDecoration:"none", fontSize:12, fontWeight:500, padding:"6px 12px", border:`1px solid ${C.goldBorder}`, borderRadius:4, marginLeft:4 }}>
              gullyturf@npbhs.school.nz
            </a>
          </div>
        </div>
      </header>

      {/* TOAST */}
      {toast && (
        <div style={{ position:"fixed", top:20, right:20, zIndex:300, padding:"14px 20px", borderRadius:6, maxWidth:380, boxShadow:"0 8px 30px rgba(0,0,0,0.4)", animation:"npbhsSlide 0.3s ease-out", background: toast.type === "error" ? "#3a1515" : C.gold, color: toast.type === "error" ? "#ff8888" : C.black, border: toast.type === "error" ? `1px solid ${C.redBorder}` : "none" }}>
          <style>{`@keyframes npbhsSlide { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
          <div style={{ fontWeight:700, fontSize:13, whiteSpace:"pre-line" }}>{toast.message}</div>
          <button onClick={() => setToast(null)} style={{ position:"absolute", top:6, right:8, background:"none", border:"none", cursor:"pointer", fontSize:16, color:"inherit", opacity:0.6 }}>×</button>
        </div>
      )}

      <div style={{ maxWidth:1400, margin:"0 auto", padding:"0 16px" }}>

      {/* ══════════════ BOOKING PAGE ══════════════ */}
      {page === "booking" && <>
        <div style={{ padding:"20px 0", display:"flex", gap:16, flexWrap:"wrap", justifyContent:"center" }}>
          {[
            { label:"Weekday", value:"$30+GST", sub:"30min · from 5:30PM" },
            { label:"Weekend", value:"$50+GST", sub:"60min · 6AM–10PM" },
            { label:"Lighting", value:"+$25/hr+GST", sub:"After 7:30PM" },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ flex:"1 1 180px", maxWidth:260, padding:"12px 16px", borderRadius:6, background:C.goldSubtle, border:`1px solid ${C.goldBorder}` }}>
              <div style={{ fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:1.5, fontWeight:600 }}>{label}</div>
              <div style={{ fontSize:20, fontWeight:800, color:C.gold, marginTop:2, fontFamily:"'Source Serif 4',Georgia,serif" }}>{value}</div>
              <div style={{ fontSize:11, color:C.textSecondary, marginTop:1 }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0 16px", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={() => setView("week")} style={btn(view==="week")}>Week</button>
            <button onClick={() => setView("day")} style={btn(view==="day")}>Day</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <button onClick={() => setWeekOffset(w=>w-1)} style={{ width:34, height:34, borderRadius:4, border:`1px solid ${C.goldBorder}`, background:"transparent", color:C.gold, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>&lsaquo;</button>
            <button onClick={() => setWeekOffset(0)} style={btn(weekOffset===0)}>Today</button>
            <button onClick={() => setWeekOffset(w=>w+1)} style={{ width:34, height:34, borderRadius:4, border:`1px solid ${C.goldBorder}`, background:"transparent", color:C.gold, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>&rsaquo;</button>
            <span style={{ fontSize:14, color:C.textSecondary, fontWeight:600, marginLeft:10, fontFamily:"'Source Serif 4',Georgia,serif" }}>
              {fmtDate(weekDates[0])} — {fmtDate(weekDates[6])}
            </span>
          </div>
        </div>

        <div style={{ fontSize:12, color:C.textSecondary, marginBottom:12, padding:"7px 12px", background:C.goldSubtle, border:`1px solid ${C.goldBorder}`, borderRadius:4, display:"inline-block" }}>
          Click to select multiple slots, then book them all at once
        </div>

        <div style={{ display:"flex", gap:16, marginBottom:14, fontSize:11, color:C.textMuted, flexWrap:"wrap" }}>
          {[
            { color:C.goldSubtle, border:C.goldBorder, label:"Available" },
            { color:C.goldSelected, border:C.goldSelectedBorder, label:"Selected" },
            { color:C.redBg, border:C.redBorder, label:"Booked" },
            { color:C.blueBg, border:C.blueBorder, label:"Blocked" },
            { color:"rgba(200,168,78,0.15)", border:"rgba(200,168,78,0.35)", label:"Lighting" },
            { color:"rgba(100,100,100,0.15)", border:"rgba(100,100,100,0.25)", label:"Past" },
          ].map(({ color, border, label }) => (
            <span key={label} style={{ display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:12, height:12, borderRadius:3, background:color, border:`1px solid ${border}` }} />{label}
            </span>
          ))}
        </div>

        {view === "day" && (
          <div style={{ display:"flex", gap:4, marginBottom:18, overflowX:"auto", paddingBottom:4 }}>
            {DAYS.map((day,i) => (
              <button key={day} onClick={() => setSelectedDay(i)} style={{ flex:"1 0 auto", padding:"8px 14px", borderRadius:4, border:`1px solid ${selectedDay===i ? C.gold : C.goldBorder}`, background:selectedDay===i ? C.gold : "transparent", color:selectedDay===i ? C.black : C.textSecondary, fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                <div>{SHORT_DAYS[i]}</div>
                <div style={{ fontSize:10, opacity:0.7, marginTop:2 }}>{fmtDate(weekDates[i])}</div>
              </button>
            ))}
          </div>
        )}

        {/* WEEK VIEW */}
        {view === "week" && (
          <div style={{ overflowX:"auto", paddingBottom:20 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,minmax(140px,1fr))", gap:6 }}>
              {DAYS.map((day,dayIdx) => {
                const blocked = isBlocked(dayIdx);
                return (
                <div key={day}>
                  <div style={{ padding:"8px 6px", textAlign:"center", fontWeight:700, fontSize:13, fontFamily:"'Source Serif 4',Georgia,serif", color: blocked ? C.blue : isWeekend(dayIdx) ? C.gold : C.textPrimary, borderBottom:`2px solid ${blocked ? C.blueBorder : isWeekend(dayIdx) ? C.gold : C.goldBorder}`, marginBottom:6 }}>
                    {SHORT_DAYS[dayIdx]}
                    <div style={{ fontSize:10, fontWeight:400, color:C.textMuted, marginTop:1, fontFamily:"'Source Sans 3',sans-serif" }}>{fmtDate(weekDates[dayIdx])}</div>
                    {blocked && <div style={{ fontSize:9, color:C.blue, fontWeight:600, marginTop:2 }}>{blockedDates[dateKey(weekDates[dayIdx])]?.reason || "BLOCKED"}</div>}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    {!blocked && allSlots[dayIdx].map((slot) => {
                      const slotBlock = isSlotBlockedForDay(dayIdx, slot);
                      const booked = isBooked(slot.id, dayIdx), past = isPast(dayIdx, slot), selected = isSelected(slot.id);
                      const disabled = booked || past || !!slotBlock;
                      let bg = C.goldSubtle, border = `1px solid ${C.goldBorder}`, tc = C.textPrimary;
                      if (selected) { bg = C.goldSelected; border = `2px solid ${C.gold}`; }
                      else if (slotBlock) { bg = C.blueBg; border = `1px solid ${C.blueBorder}`; tc = C.blue; }
                      else if (booked) { bg = C.redBg; border = `1px solid ${C.redBorder}`; tc = C.red; }
                      else if (past) { bg = "rgba(100,100,100,0.08)"; border = "1px solid rgba(100,100,100,0.15)"; tc = "#555"; }
                      else if (slot.needsLighting) { bg = "rgba(200,168,78,0.12)"; border = "1px solid rgba(200,168,78,0.3)"; }
                      return (
                        <button key={slot.id} disabled={disabled} onClick={() => toggleSlot(slot)} style={{ padding:selected?"5px 6px":"6px 7px", borderRadius:4, border, cursor:disabled?"default":"pointer", background:bg, textAlign:"left", fontFamily:"inherit", opacity:past?0.45:1, transition:"all 0.15s", position:"relative" }}
                          onMouseEnter={e => { if (!disabled && !selected) e.currentTarget.style.borderColor = C.gold; }}
                          onMouseLeave={e => { if (!disabled && !selected) e.currentTarget.style.borderColor = slot.needsLighting?"rgba(200,168,78,0.3)":C.goldBorder; }}>
                          {selected && <div style={{ position:"absolute", top:2, right:4, fontSize:9, color:C.gold, fontWeight:800 }}>✓</div>}
                          <div style={{ fontSize:10, fontWeight:600, color:selected?C.gold:tc, fontFamily:"'DM Mono',monospace" }}>{slot.label}</div>
                          {slotBlock ? <div style={{ fontSize:8, color:C.blue, marginTop:1, fontWeight:600 }}>BLOCKED</div>
                            : booked ? <div style={{ fontSize:8, color:C.red, marginTop:1, fontWeight:600 }}>BOOKED</div>
                            : past ? <div style={{ fontSize:8, color:"#555", marginTop:1 }}>Past</div>
                            : <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:1 }}>
                                <span style={{ fontSize:10, color:C.gold, fontWeight:700 }}>${slot.total.toFixed(2)}</span>
                                {slot.needsLighting && <span style={{ fontSize:8, color:C.goldDark, fontWeight:600 }}>+L</span>}
                              </div>}
                        </button>
                      );
                    })}
                    {blocked && <div style={{ padding:16, textAlign:"center", fontSize:12, color:C.blue, opacity:0.7 }}>Unavailable</div>}
                  </div>
                </div>);
              })}
            </div>
          </div>
        )}

        {/* DAY VIEW */}
        {view === "day" && (
          <div style={{ maxWidth:640, margin:"0 auto" }}>
            <h2 style={{ fontSize:20, fontWeight:700, color:C.textPrimary, margin:"0 0 16px", textAlign:"center", fontFamily:"'Source Serif 4',Georgia,serif" }}>
              {DAYS[selectedDay]}, {fmtDate(weekDates[selectedDay])}
              {isWeekend(selectedDay) && <span style={{ fontSize:13, color:C.gold, marginLeft:10, fontWeight:500 }}>Weekend · 1hr</span>}
            </h2>
            {isBlocked(selectedDay) ? (
              <div style={{ padding:40, textAlign:"center", background:C.blueBg, border:`1px solid ${C.blueBorder}`, borderRadius:8 }}>
                <div style={{ fontSize:18, fontWeight:700, color:C.blue }}>Date Blocked</div>
                <div style={{ fontSize:14, color:C.textSecondary, marginTop:8 }}>{blockedDates[dateKey(weekDates[selectedDay])]?.reason || "Unavailable"}</div>
              </div>
            ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {allSlots[selectedDay].map((slot) => {
                const slotBlock = isSlotBlockedForDay(selectedDay, slot);
                const booked = isBooked(slot.id, selectedDay), past = isPast(selectedDay, slot), selected = isSelected(slot.id);
                const disabled = booked || past || !!slotBlock;
                let bg, border, statusText, statusColor;
                if (selected) { bg = C.goldSelected; border = `2px solid ${C.gold}`; statusText = "Selected"; statusColor = C.gold; }
                else if (slotBlock) { bg = C.blueBg; border = `1px solid ${C.blueBorder}`; statusText = `Blocked — ${slotBlock.reason||"Unavailable"}`; statusColor = C.blue; }
                else if (booked) { bg = C.redBg; border = `1px solid ${C.redBorder}`; const bk = bookings[`${dateKey(weekDates[selectedDay])}-${slot.id}`]; statusText = `Booked — ${bk?.name||"Reserved"}`; statusColor = C.red; }
                else if (past) { bg = "rgba(100,100,100,0.08)"; border = "1px solid rgba(100,100,100,0.15)"; statusText = "Past"; statusColor = "#555"; }
                else { bg = slot.needsLighting?"rgba(200,168,78,0.1)":C.goldSubtle; border = `1px solid ${slot.needsLighting?"rgba(200,168,78,0.3)":C.goldBorder}`; statusText = "Available"; statusColor = C.gold; }
                return (
                  <button key={slot.id} disabled={disabled} onClick={() => toggleSlot(slot)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:selected?"13px 17px":"14px 18px", borderRadius:6, border, cursor:disabled?"default":"pointer", background:bg, fontFamily:"inherit", textAlign:"left", opacity:past?0.45:1, transition:"all 0.2s" }}
                    onMouseEnter={e => { if (!disabled && !selected) e.currentTarget.style.borderColor = C.gold; }}
                    onMouseLeave={e => { if (!disabled && !selected) e.currentTarget.style.borderColor = slot.needsLighting?"rgba(200,168,78,0.3)":C.goldBorder; }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:20, height:20, borderRadius:4, border:`2px solid ${selected?C.gold:C.goldBorder}`, background:selected?C.gold:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {selected && <span style={{ color:C.black, fontSize:12, fontWeight:800 }}>✓</span>}
                      </div>
                      <div>
                        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:500, color:C.textPrimary }}>{slot.label} — {slot.endLabel}</div>
                        <div style={{ fontSize:11, color:statusColor, marginTop:3, fontWeight:600 }}>{statusText}</div>
                      </div>
                    </div>
                    {!disabled && <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:18, fontWeight:800, color:C.gold, fontFamily:"'Source Serif 4',Georgia,serif" }}>${slot.total.toFixed(2)}</div>
                      <div style={{ fontSize:10, color:C.textMuted }}>incl. GST</div>
                    </div>}
                  </button>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* FLOATING CART */}
        {selectedList.length > 0 && (
          <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:50, background:C.black, borderTop:`2px solid ${C.gold}`, padding:"10px 24px", animation:"cartSlide 0.25s ease-out" }}>
            <style>{`@keyframes cartSlide { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
            <div style={{ maxWidth:1400, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:30, height:30, borderRadius:6, background:C.gold, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800, color:C.black }}>{selectedList.length}</div>
                <span style={{ fontSize:13, color:C.textSecondary }}>{selectedList.length === 1 ? "slot" : "slots"}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:20, fontWeight:800, color:C.gold, fontFamily:"'Source Serif 4',Georgia,serif" }}>${selectedTotal.toFixed(2)}</div>
                <button onClick={() => setSelectedSlots({})} style={{ padding:"8px 14px", borderRadius:4, border:`1px solid ${C.goldBorder}`, background:"transparent", color:C.textSecondary, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Clear</button>
                <button onClick={() => setShowModal(true)} style={{ padding:"8px 20px", borderRadius:4, border:"none", background:C.gold, color:C.black, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Book {selectedList.length} Slot{selectedList.length>1?"s":""}</button>
              </div>
            </div>
          </div>
        )}

        {/* BOOKING MODAL */}
        {showModal && (
          <div style={{ position:"fixed", inset:0, zIndex:100, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => !submitting && setShowModal(false)}>
            <div onClick={e => e.stopPropagation()} style={{ background:C.cardBg, border:`1px solid ${C.goldBorder}`, borderRadius:8, padding:28, maxWidth:520, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.6)", maxHeight:"90vh", overflowY:"auto" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                <img src="https://npbhs2023.ibcdn.nz/media/2023_07_07_logo-transparent-bg.svg" alt="NPBHS" style={{ height:32 }} />
                <div>
                  <h3 style={{ margin:0, fontSize:17, fontWeight:700, color:C.textPrimary, fontFamily:"'Source Serif 4',Georgia,serif" }}>Confirm Booking{selectedList.length>1?"s":""}</h3>
                  <p style={{ margin:0, fontSize:11, color:C.textMuted }}>{selectedList.length} slot{selectedList.length>1?"s":""} · Gully Turf</p>
                </div>
              </div>

              <div style={{ background:C.goldSubtle, border:`1px solid ${C.goldBorder}`, borderRadius:6, padding:14, marginBottom:16, maxHeight:200, overflowY:"auto" }}>
                {selectedList.map((slot,i) => (
                  <div key={slot.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderTop:i>0?`1px solid ${C.goldBorder}`:"none" }}>
                    <div>
                      <span style={{ fontSize:11, color:C.gold, fontWeight:600, marginRight:6 }}>{SHORT_DAYS[slot.dayIndex]}</span>
                      <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:C.textPrimary }}>{slot.label}–{slot.endLabel}</span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:C.gold }}>${slot.total.toFixed(2)}</span>
                      <button onClick={() => toggleSlot(slot)} style={{ width:20, height:20, borderRadius:4, border:`1px solid ${C.redBorder}`, background:C.redBg, color:C.red, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recurring */}
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Repeat Weekly</label>
                <div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
                  {[0,1,2,3,4,5,6,7,8].map(w => (
                    <button key={w} onClick={() => setRepeatWeeks(w)} style={{ padding:"6px 10px", borderRadius:4, border:`1px solid ${repeatWeeks===w?C.gold:C.goldBorder}`, background:repeatWeeks===w?C.gold:"transparent", color:repeatWeeks===w?C.black:C.textSecondary, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{w===0?"None":`${w+1}wk`}</button>
                  ))}
                </div>
                {repeatWeeks > 0 && <div style={{ fontSize:11, color:C.textSecondary, marginTop:6 }}>Repeats for {repeatWeeks + 1} weeks ({totalSlotsCount} total slots)</div>}
              </div>

              {/* Totals */}
              <div style={{ background:C.goldSubtle, border:`1px solid ${C.goldBorder}`, borderRadius:6, padding:14, marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:C.textSecondary, marginBottom:4 }}><span>Turf hire ({totalSlotsCount} slots)</span><span>${grandBase.toFixed(2)}</span></div>
                {grandLighting > 0 && <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:C.goldDark, marginBottom:4 }}><span>Lighting</span><span>${grandLighting.toFixed(2)}</span></div>}
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:C.textSecondary, marginBottom:4 }}><span>GST (15%)</span><span>${grandGst.toFixed(2)}</span></div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:18, fontWeight:800, color:C.gold, borderTop:`1px solid ${C.goldBorder}`, paddingTop:8, marginTop:4, fontFamily:"'Source Serif 4',Georgia,serif" }}><span>Total</span><span>${grandTotal.toFixed(2)}</span></div>
              </div>

              {/* Form */}
              {[
                { key:"name", label:"Full Name *", placeholder:"Your full name" },
                { key:"email", label:"Email *", placeholder:"your@email.com", type:"email" },
                { key:"phone", label:"Phone", placeholder:"027 000 0000", type:"tel" },
                { key:"org", label:"Organisation / Team", placeholder:"Team or club name" },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key} style={{ marginBottom:12 }}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type||"text"} value={bookingForm[key]} onChange={e => setBookingForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} style={inputStyle} />
                </div>
              ))}

              {/* T&Cs */}
              <div style={{ marginBottom:16, marginTop:8 }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" }} onClick={() => setTermsAccepted(!termsAccepted)}>
                  <div style={{ width:20, height:20, borderRadius:4, border:`2px solid ${termsAccepted?C.gold:C.goldBorder}`, background:termsAccepted?C.gold:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                    {termsAccepted && <span style={{ color:C.black, fontSize:12, fontWeight:800 }}>✓</span>}
                  </div>
                  <div style={{ fontSize:13, color:C.textSecondary }}>
                    I agree to the <span style={{ color:C.gold, textDecoration:"underline", cursor:"pointer" }} onClick={e => { e.stopPropagation(); setShowTermsDetail(!showTermsDetail); }}>Terms & Conditions of Hire</span> *
                  </div>
                </div>
                {showTermsDetail && (
                  <div style={{ marginTop:10, padding:14, background:"rgba(0,0,0,0.2)", border:`1px solid ${C.goldBorder}`, borderRadius:6, maxHeight:200, overflowY:"auto" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.textPrimary, marginBottom:8 }}>Gully Turf — Terms & Conditions of Hire</div>
                    {TERMS.map((t,i) => <div key={i} style={{ fontSize:12, color:C.textSecondary, marginBottom:6, paddingLeft:16, textIndent:-16 }}>{i+1}. {t}</div>)}
                  </div>
                )}
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setShowModal(false)} disabled={submitting} style={{ flex:1, padding:"11px", borderRadius:4, border:`1px solid ${C.goldBorder}`, background:"transparent", color:C.textSecondary, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
                <button onClick={handleBook} disabled={!bookingForm.name || !bookingForm.email || !termsAccepted || submitting} style={{
                  flex:2, padding:"11px", borderRadius:4, border:"none",
                  background: bookingForm.name && bookingForm.email && termsAccepted && !submitting ? C.gold : "rgba(200,168,78,0.25)",
                  color: bookingForm.name && bookingForm.email && termsAccepted && !submitting ? C.black : C.textMuted,
                  fontSize:13, fontWeight:700, cursor: bookingForm.name && bookingForm.email && termsAccepted && !submitting ? "pointer" : "default", fontFamily:"inherit",
                }}>{submitting ? "Booking..." : `Confirm — $${grandTotal.toFixed(2)}`}</button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation */}
        {showConfirmation && (
          <div style={{ position:"fixed", inset:0, zIndex:150, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={() => setShowConfirmation(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background:C.cardBg, border:`2px solid ${C.gold}`, borderRadius:12, padding:36, maxWidth:420, width:"100%", textAlign:"center" }}>
              <div style={{ fontSize:48, marginBottom:8 }}>✓</div>
              <h3 style={{ margin:"0 0 8px", fontSize:22, fontWeight:800, color:C.gold, fontFamily:"'Source Serif 4',Georgia,serif" }}>Booking Confirmed</h3>
              <p style={{ margin:"0 0 16px", fontSize:14, color:C.textSecondary }}>{showConfirmation.count} slot{showConfirmation.count>1?"s":""}{showConfirmation.weeks > 0 ? ` over ${showConfirmation.weeks+1} weeks` : ""}</p>
              <div style={{ background:C.goldSubtle, border:`1px solid ${C.goldBorder}`, borderRadius:8, padding:16, marginBottom:16 }}>
                <div style={{ fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>Your Booking Reference</div>
                <div style={{ fontSize:28, fontWeight:800, color:C.gold, fontFamily:"'DM Mono',monospace", letterSpacing:2 }}>{showConfirmation.ref}</div>
                <div style={{ fontSize:11, color:C.textSecondary, marginTop:6 }}>Save this to manage or cancel your booking</div>
              </div>
              <div style={{ fontSize:18, fontWeight:800, color:C.gold, fontFamily:"'Source Serif 4',Georgia,serif", marginBottom:16 }}>Total: ${showConfirmation.total.toFixed(2)}</div>
              <button onClick={() => setShowConfirmation(null)} style={{ padding:"10px 32px", borderRadius:4, border:"none", background:C.gold, color:C.black, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Done</button>
            </div>
          </div>
        )}
      </>}

      {/* ══════════════ MANAGE BOOKING ══════════════ */}
      {page === "manage" && (
        <div style={{ maxWidth:560, margin:"40px auto", padding:"0 16px" }}>
          <h2 style={{ fontSize:22, fontWeight:700, color:C.textPrimary, marginBottom:8, fontFamily:"'Source Serif 4',Georgia,serif" }}>Manage Your Booking</h2>
          <p style={{ fontSize:13, color:C.textSecondary, marginBottom:24 }}>Enter your booking reference to view or cancel.</p>
          <div style={{ display:"flex", gap:8, marginBottom:24 }}>
            <input value={manageRef} onChange={e => setManageRef(e.target.value)} placeholder="e.g. GT-A1B2C3" style={{ ...inputStyle, flex:1, fontSize:18, fontFamily:"'DM Mono',monospace", textTransform:"uppercase", letterSpacing:2 }} onKeyDown={e => { if (e.key === "Enter") lookupBooking(); }} />
            <button onClick={lookupBooking} disabled={manageLooking} style={{ padding:"10px 24px", borderRadius:4, border:"none", background:C.gold, color:C.black, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{manageLooking ? "..." : "Look Up"}</button>
          </div>
          {manageResult !== null && manageResult.length === 0 && (
            <div style={{ padding:24, textAlign:"center", background:C.redBg, border:`1px solid ${C.redBorder}`, borderRadius:8 }}>
              <div style={{ fontSize:16, fontWeight:700, color:C.red }}>Booking not found</div>
              <div style={{ fontSize:13, color:C.textSecondary, marginTop:6 }}>Check your reference or contact gullyturf@npbhs.school.nz</div>
            </div>
          )}
          {manageResult && manageResult.length > 0 && (
            <div style={{ background:C.goldSubtle, border:`1px solid ${C.goldBorder}`, borderRadius:8, padding:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:1.5 }}>Reference</div>
                  <div style={{ fontSize:20, fontWeight:800, color:C.gold, fontFamily:"'DM Mono',monospace" }}>{manageResult[0].ref}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:11, color:C.textMuted }}>Booked by</div>
                  <div style={{ fontSize:14, fontWeight:600, color:C.textPrimary }}>{manageResult[0].name}</div>
                </div>
              </div>
              <div style={{ fontSize:12, color:C.textSecondary, marginBottom:12 }}>
                {manageResult[0].email} {manageResult[0].phone && `· ${manageResult[0].phone}`} {manageResult[0].org && `· ${manageResult[0].org}`}
              </div>
              {(() => {
                const byDate = {};
                manageResult.forEach(b => {
                  const dk = b.dateKey || dateKey(new Date(b.date));
                  if (!byDate[dk]) byDate[dk] = { date: new Date(b.date), slots: [], total: 0 };
                  byDate[dk].slots.push(b);
                  byDate[dk].total += b.slot.total;
                });
                const sorted = Object.values(byDate).sort((a,b) => a.date - b.date);
                return <>
                  <div style={{ fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>{sorted.length} date{sorted.length!==1?"s":""} · {manageResult.length} slot{manageResult.length!==1?"s":""}</div>
                  {sorted.map((group, i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderTop:i>0?`1px solid ${C.goldBorder}`:"none" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:40, height:40, borderRadius:6, background:"rgba(200,168,78,0.12)", border:`1px solid ${C.goldBorder}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                          <div style={{ fontSize:14, fontWeight:800, color:C.gold, lineHeight:1 }}>{group.date.getDate()}</div>
                          <div style={{ fontSize:9, color:C.textMuted, textTransform:"uppercase" }}>{group.date.toLocaleString("en-NZ",{month:"short"})}</div>
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:C.textPrimary }}>{DAYS[group.date.getDay()===0?6:group.date.getDay()-1]}</div>
                          <div style={{ fontSize:11, color:C.textSecondary }}>{group.slots.length} slot{group.slots.length!==1?"s":""} · {group.slots[0].slot.label} – {group.slots[group.slots.length-1].slot.endLabel}</div>
                        </div>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:C.gold }}>${group.total.toFixed(2)}</div>
                    </div>
                  ))}
                </>;
              })()}
              <div style={{ borderTop:`1px solid ${C.goldBorder}`, marginTop:12, paddingTop:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontSize:18, fontWeight:800, color:C.gold, fontFamily:"'Source Serif 4',Georgia,serif" }}>Total: ${manageResult.reduce((s,b) => s + b.slot.total, 0).toFixed(2)}</div>
                <button onClick={() => { if (confirm("Cancel this entire booking?")) cancelBooking(manageResult[0].ref); }} disabled={submitting}
                  style={{ padding:"10px 20px", borderRadius:4, border:`1px solid ${C.redBorder}`, background:C.redBg, color:C.red, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  {submitting ? "Cancelling..." : "Cancel Booking"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ ADMIN ══════════════ */}
      {page === "admin" && !adminAuth && (
        <div style={{ maxWidth:400, margin:"80px auto", textAlign:"center" }}>
          <h2 style={{ fontSize:22, fontWeight:700, color:C.textPrimary, marginBottom:8, fontFamily:"'Source Serif 4',Georgia,serif" }}>Admin Access</h2>
          <p style={{ fontSize:13, color:C.textSecondary, marginBottom:24 }}>Enter the admin PIN.</p>
          <div style={{ display:"flex", gap:8 }}>
            <input type="password" value={adminPin} onChange={e => setAdminPin(e.target.value)} placeholder="PIN" style={{ ...inputStyle, flex:1, textAlign:"center", fontSize:18, letterSpacing:4 }}
              onKeyDown={e => { if (e.key === "Enter") { if (adminPin === ADMIN_PIN) setAdminAuth(true); else setToast({ type:"error", message:"Incorrect PIN." }); }}} />
            <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else setToast({ type:"error", message:"Incorrect PIN." }); }}
              style={{ padding:"10px 24px", borderRadius:4, border:"none", background:C.gold, color:C.black, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Enter</button>
          </div>
        </div>
      )}

      {page === "admin" && adminAuth && (
        <div style={{ maxWidth:900, margin:"24px auto", padding:"0 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <h2 style={{ fontSize:22, fontWeight:700, color:C.textPrimary, margin:0, fontFamily:"'Source Serif 4',Georgia,serif" }}>Admin Panel</h2>
            <button onClick={() => { setAdminAuth(false); setAdminPin(""); setPage("booking"); }} style={{ padding:"8px 16px", borderRadius:4, border:`1px solid ${C.redBorder}`, background:C.redBg, color:C.red, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Log Out</button>
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:20 }}>
            <button onClick={() => setAdminTab("bookings")} style={btn(adminTab==="bookings")}>All Bookings</button>
            <button onClick={() => setAdminTab("blocks")} style={btn(adminTab==="blocks")}>Block Dates</button>
          </div>

          {adminTab === "bookings" && (
            <div>
              <div style={{ fontSize:13, color:C.textSecondary, marginBottom:16 }}>{allBookingsList.length} booking group{allBookingsList.length!==1?"s":""}</div>
              {allBookingsList.length === 0 && <div style={{ padding:40, textAlign:"center", color:C.textMuted }}>No bookings yet.</div>}
              {allBookingsList.map(group => (
                <div key={group.ref} style={{ background:C.goldSubtle, border:`1px solid ${C.goldBorder}`, borderRadius:8, padding:16, marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8, marginBottom:8 }}>
                    <div>
                      <span style={{ fontSize:14, fontWeight:700, color:C.gold, fontFamily:"'DM Mono',monospace", marginRight:12 }}>{group.ref}</span>
                      <span style={{ fontSize:14, fontWeight:600, color:C.textPrimary }}>{group.name}</span>
                      <div style={{ fontSize:12, color:C.textSecondary, marginTop:2 }}>{group.email} {group.phone && `· ${group.phone}`} {group.org && `· ${group.org}`}</div>
                    </div>
                    <button onClick={() => { if (confirm(`Cancel ${group.ref}?`)) adminCancelBooking(group.ref); }} disabled={submitting}
                      style={{ padding:"6px 14px", borderRadius:4, border:`1px solid ${C.redBorder}`, background:C.redBg, color:C.red, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                  {(() => {
                    const byDate = {};
                    group.slots.forEach(b => {
                      const dk = b.dateKey || dateKey(new Date(b.date));
                      if (!byDate[dk]) byDate[dk] = { date: new Date(b.date), count: 0, total: 0 };
                      byDate[dk].count++;
                      byDate[dk].total += b.slot.total;
                    });
                    return Object.values(byDate).sort((a,b) => a.date - b.date).map((dg, i) => (
                      <span key={i} style={{ fontSize:11, padding:"4px 10px", borderRadius:4, background:"rgba(200,168,78,0.12)", border:`1px solid ${C.goldBorder}`, color:C.textSecondary, display:"inline-flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontWeight:600, color:C.textPrimary }}>{fmtDate(dg.date)}</span>
                        {dg.count} slot{dg.count!==1?"s":""}
                        <span style={{ color:C.gold, fontWeight:600 }}>${dg.total.toFixed(2)}</span>
                      </span>
                    ));
                  })()}
                  </div>
                  <div style={{ fontSize:11, color:C.textMuted, marginTop:6 }}>
                    {group.slots.length} slot{group.slots.length!==1?"s":""} · Total: ${group.slots.reduce((s,b) => s+b.slot.total, 0).toFixed(2)} · Booked {new Date(group.bookedAt).toLocaleDateString("en-NZ")}
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab === "blocks" && (
            <div>
              <div style={{ marginBottom:20 }}>
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  <button onClick={() => setBlockForm(f => ({...f, type:"full", startTime:"", endTime:""}))} style={btn(blockForm.type==="full")}>Full Day</button>
                  <button onClick={() => setBlockForm(f => ({...f, type:"slots"}))} style={btn(blockForm.type==="slots")}>Specific Times</button>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <div style={{ flex:"1 1 180px" }}>
                    <label style={labelStyle}>Date</label>
                    <input type="date" value={blockForm.date} onChange={e => setBlockForm(f => ({...f, date:e.target.value}))} style={inputStyle} />
                  </div>
                  {blockForm.type === "slots" && <>
                    <div style={{ flex:"0 1 140px" }}>
                      <label style={labelStyle}>Start Time</label>
                      <input type="time" value={blockForm.startTime} onChange={e => setBlockForm(f => ({...f, startTime:e.target.value}))} style={inputStyle} />
                    </div>
                    <div style={{ flex:"0 1 140px" }}>
                      <label style={labelStyle}>End Time</label>
                      <input type="time" value={blockForm.endTime} onChange={e => setBlockForm(f => ({...f, endTime:e.target.value}))} style={inputStyle} />
                    </div>
                  </>}
                  <div style={{ flex:"2 1 200px" }}>
                    <label style={labelStyle}>Reason</label>
                    <input value={blockForm.reason} onChange={e => setBlockForm(f => ({...f, reason:e.target.value}))} placeholder="e.g. Tournament, Maintenance" style={inputStyle} />
                  </div>
                  <div style={{ display:"flex", alignItems:"flex-end" }}>
                    <button onClick={addBlock} disabled={!blockForm.date || (blockForm.type==="slots" && (!blockForm.startTime || !blockForm.endTime))} style={{ padding:"10px 20px", borderRadius:4, border:"none", background:blockForm.date?C.gold:"rgba(200,168,78,0.25)", color:blockForm.date?C.black:C.textMuted, fontSize:13, fontWeight:700, cursor:blockForm.date?"pointer":"default", fontFamily:"inherit" }}>Block</button>
                  </div>
                </div>
              </div>

              <div style={{ fontSize:13, color:C.textSecondary, marginBottom:12 }}>Active Blocks ({Object.keys(blockedDates).length})</div>
              {Object.keys(blockedDates).length === 0 && <div style={{ padding:24, textAlign:"center", color:C.textMuted }}>No dates blocked.</div>}
              {Object.entries(blockedDates).sort(([a],[b]) => a.localeCompare(b)).map(([dk, block]) => (
                <div key={dk} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:C.blueBg, border:`1px solid ${C.blueBorder}`, borderRadius:6, marginBottom:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:14, fontWeight:600, color:C.blue, fontFamily:"'DM Mono',monospace" }}>{block.date}</span>
                    <span style={{ fontSize:12, padding:"2px 8px", borderRadius:4, background:"rgba(45,109,168,0.2)", color:C.blue, fontWeight:600 }}>
                      {block.type === "slots" ? `${block.startTime} – ${block.endTime}` : "Full Day"}
                    </span>
                    <span style={{ fontSize:13, color:C.textSecondary }}>{block.reason}</span>
                  </div>
                  <button onClick={() => removeBlock(dk)} style={{ padding:"5px 12px", borderRadius:4, border:`1px solid ${C.redBorder}`, background:C.redBg, color:C.red, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FOOTER */}
      <footer style={{ padding:"32px 0", marginTop:40, borderTop:`2px solid ${C.gold}`, textAlign:"center" }}>
        <img src="https://npbhs2023.ibcdn.nz/media/2023_07_07_logo-transparent-bg.svg" alt="NPBHS" style={{ height:44, marginBottom:10, opacity:0.7 }} />
        <p style={{ margin:"0 0 3px", fontSize:13, fontWeight:700, color:C.textSecondary, fontFamily:"'Source Serif 4',Georgia,serif" }}>New Plymouth Boys' High School</p>
        <p style={{ margin:"0 0 3px", fontSize:11, color:C.textMuted }}>107 Coronation Ave, New Plymouth 4312</p>
        <p style={{ margin:"0 0 3px", fontSize:11, color:C.textMuted }}>(06) 758-5399</p>
        <p style={{ margin:"0 0 12px", fontSize:12 }}><a href="mailto:gullyturf@npbhs.school.nz" style={{ color:C.gold, textDecoration:"none", fontWeight:600 }}>gullyturf@npbhs.school.nz</a></p>
        <div style={{ fontSize:10, color:C.textMuted, lineHeight:1.6 }}>Weekday bookings from 5:30 PM. All prices incl. GST. Lighting surcharge after 7:30 PM.</div>
        <div style={{ marginTop:12, fontSize:9, color:"rgba(200,168,78,0.3)", fontWeight:600, letterSpacing:2, textTransform:"uppercase" }}>Improving the Future Since 1882</div>
      </footer>
      </div>
    </div>
  );
}
