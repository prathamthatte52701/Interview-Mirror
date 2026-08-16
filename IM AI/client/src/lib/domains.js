import {
  Cloud,
  Code2,
  Cpu,
  Database,
  Landmark,
  Megaphone,
  Palette,
  ShieldCheck,
  Target,
  Users
} from 'lucide-react';

export const DOMAINS = [
  { value: 'software-engineer', label: 'Software Engineering', icon: Code2 },
  { value: 'data-scientist', label: 'Data Science', icon: Database },
  { value: 'product-manager', label: 'Product Manager', icon: Target },
  { value: 'hr-general', label: 'HR & General', icon: Users },
  { value: 'finance', label: 'Finance', icon: Landmark },
  { value: 'devops', label: 'DevOps & Cloud', icon: Cloud },
  { value: 'machine-learning', label: 'Machine Learning', icon: Cpu },
  { value: 'marketing', label: 'Marketing', icon: Megaphone },
  { value: 'cybersecurity', label: 'Cybersecurity', icon: ShieldCheck },
  { value: 'design', label: 'Design & UX', icon: Palette }
];
