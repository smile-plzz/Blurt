// Shared source of truth for the ten onboarding questions - used by both
// onboarding.js (first-run flow) and review.js (resumable per-question edit,
// mockup screens 15-17). Answers are keyed by `id` in
// persona.onboarding_profile, same shape either script writes them in.

const QUESTIONS = [
  {
    id: "entry_state",
    pass: "Pass 1 of 3",
    title: "How's your head right now?",
    options: [
      { label: "Pretty full — a lot going on", value: "overwhelmed_full" },
      { label: "Foggy — can't get a grip on anything", value: "foggy" },
      { label: "Flat — nothing feels worth starting", value: "flat" },
      { label: "Fine, mostly — here to get ahead of it", value: "fine_ahead_of_it" }
    ]
  },
  {
    id: "typical_intent_class",
    pass: "Pass 1 of 3",
    title: "What's a thing you've been meaning to do?",
    options: [
      { label: "Small and annoying (a call, a form, a chore)", value: "small_annoying" },
      { label: "Big and vague (a project, a move, a change)", value: "big_vague" },
      { label: "Something for someone else", value: "for_someone_else" },
      { label: "Honestly, a pile of all three", value: "mixed" }
    ]
  },
  {
    id: "intent_surface_moments",
    pass: "Pass 1 of 3",
    title: "When do you usually notice you meant to do something?",
    array: true,
    options: [
      { label: "Right as I'm falling asleep", value: "falling_asleep" },
      { label: "Mid-task, about something unrelated", value: "mid_task" },
      { label: "When someone reminds me", value: "reminded_by_someone" },
      { label: "Too late to do anything about it", value: "too_late" }
    ]
  },
  {
    id: "primary_stall_point",
    pass: "Pass 2 of 3",
    title: "Where do things usually stall for you?",
    options: [
      { label: "Starting — I know what it is, I just can't begin", value: "starting" },
      { label: "Deciding — I don't know which thing to do first", value: "deciding" },
      { label: "Finishing — I start plenty, I just drift off", value: "finishing" },
      { label: "Remembering — it's gone before I can act", value: "remembering" }
    ]
  },
  {
    id: "avoidance_driver",
    pass: "Pass 2 of 3",
    title: "When you've been avoiding something, what's usually behind it?",
    options: [
      { label: "It's boring, and I can't make myself care", value: "boredom" },
      { label: "It's bigger than it looks and I don't know where to start", value: "size" },
      { label: "I'm dreading it — something about it stings", value: "dread" },
      { label: "I keep thinking there'll be a better moment", value: "timing" }
    ]
  },
  {
    id: "energy_windows",
    pass: "Pass 2 of 3",
    title: "When in the day do you actually have something in the tank?",
    options: [
      { label: "Early — mornings are my good hours", value: "mornings" },
      { label: "Late — I come alive at night", value: "nights" },
      { label: "In bursts, unpredictably", value: "bursts" },
      { label: "Rarely — most days are a slog right now", value: "rarely" }
    ]
  },
  {
    id: "gap_baseline_days",
    pass: "Pass 2 of 3",
    title: "How long do you usually go before checking in on your own list?",
    // Section 3.4's exact gap-baseline question. Day counts are a coarse,
    // documented mapping from the four answer bands, not a precise self-report -
    // good enough for a Recovery Mode trigger before real history exists.
    options: [
      { label: "Most days", value: 1 },
      { label: "Every few days", value: 4 },
      { label: "Every couple of weeks, if that", value: 14 },
      { label: "I don't keep one — that's the problem", value: 10 }
    ]
  },
  {
    id: "preferred_framing",
    pass: "Pass 3 of 3",
    title: "A reminder lands and you haven't done the thing. What helps?",
    options: [
      { label: "Just say the thing. “Open the lecture.”", value: "direct" },
      { label: "Ask me. “Still on your mind, or can this go?”", value: "inquiring" },
      { label: "Give me the first inch, not the whole task", value: "activation-only" },
      { label: "Leave me alone and bring it up next time I'm here", value: "silent-recovery" }
    ]
  },
  {
    id: "drop_prone_domains",
    pass: "Pass 3 of 3",
    title: "Where does it fall apart most?",
    array: true,
    options: [
      { label: "Work or study things", value: "work_study" },
      { label: "Home and admin — bills, forms, appointments", value: "home_admin" },
      { label: "People — replies, plans, birthdays", value: "people" },
      { label: "Looking after myself", value: "self_care" },
      { label: "All of it, fairly evenly", value: "even" }
    ]
  },
  {
    id: "stated_goal",
    pass: "Pass 3 of 3",
    title: "What would make this worth keeping on your phone?",
    options: [
      { label: "Catching things before I lose them", value: "catching_things" },
      { label: "Actually finishing a few of them", value: "finishing_things" },
      { label: "Feeling less behind than I do now", value: "feeling_less_behind" },
      { label: "Getting one specific thing off my back", value: "one_specific_thing" }
    ]
  }
];
