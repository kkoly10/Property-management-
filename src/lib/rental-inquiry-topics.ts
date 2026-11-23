export const rentalInquiryTopics = [
  "availability",
  "rent_and_lease",
  "utilities",
  "parking",
  "pets",
  "access_and_amenities",
  "other",
] as const;

export type RentalInquiryTopic = (typeof rentalInquiryTopics)[number];
type Language = "en" | "es" | "fr";

export const rentalInquiryTopicLabels = {
  availability: { en: "Availability and move-in", es: "Disponibilidad y mudanza", fr: "Disponibilité et emménagement" },
  rent_and_lease: { en: "Rent and lease terms", es: "Renta y condiciones", fr: "Loyer et conditions du bail" },
  utilities: { en: "Utilities", es: "Servicios incluidos", fr: "Services publics" },
  parking: { en: "Parking", es: "Estacionamiento", fr: "Stationnement" },
  pets: { en: "Pets", es: "Mascotas", fr: "Animaux" },
  access_and_amenities: { en: "Access and amenities", es: "Acceso y servicios", fr: "Accès et commodités" },
  other: { en: "Other rental question", es: "Otra pregunta sobre el alquiler", fr: "Autre question sur la location" },
} satisfies Record<RentalInquiryTopic, Record<Language, string>>;

export function isRentalInquiryTopic(value: unknown): value is RentalInquiryTopic {
  return rentalInquiryTopics.some((topic) => topic === value);
}
