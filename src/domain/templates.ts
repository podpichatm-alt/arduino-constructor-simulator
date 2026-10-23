import type { ProjectTemplate } from './types';

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: 'robot-2wd',
    title: 'Колёсный робот 2WD',
    kind: 'mobile',
    description: 'Arduino UNO, L298N, два TT-мотора и датчики.',
    components: ['Arduino UNO R3', 'L298N', 'TT Motor × 2', '2WD Chassis'],
  },
  {
    id: 'robot-arm',
    title: 'Рука-манипулятор',
    kind: 'manipulator',
    description: 'Основание, звенья, сервоприводы и захват.',
    components: ['Arduino UNO R3', 'Servo', 'Arm Links', 'Gripper'],
  },
];
