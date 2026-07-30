import { CASE_REGISTRATION_STEPS, type CaseRegistrationStepId } from "./types";

export default function StepChrome({ step }: { step: CaseRegistrationStepId }) {
  return (
    <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {CASE_REGISTRATION_STEPS.map((s) => {
        const active = s.id === step;
        const done = s.id < step;
        return (
          <li
            key={s.id}
            className={`rounded-lg border px-3 py-2 text-sm ${
              active
                ? "border-gray-900 bg-gray-900 text-white"
                : done
                  ? "border-gray-300 bg-white text-gray-800"
                  : "border-gray-200 bg-gray-50 text-gray-500"
            }`}
          >
            <span className="font-semibold">STEP{s.id}</span>
            <span className="ml-2">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
