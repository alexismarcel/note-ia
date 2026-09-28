export type Subject = {
  id: string;
  name: string;
};

export type Course = {
  id: string;
  title: string;
  subject_id: string;
};

export function bySubjectName(a: Subject, b: Subject): number {
  return a.name.localeCompare(b.name, "fr");
}

export function byCourseTitle(a: Course, b: Course): number {
  return a.title.localeCompare(b.title, "fr");
}

// "3 séances" / "1 séance". The plural is explicit because "cours" is
// invariable, and "3 courss" is exactly the kind of detail a student notices.
export function countLabel(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count} ${count > 1 ? plural : singular}`;
}
