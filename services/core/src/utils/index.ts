import * as dayjs from 'dayjs';
import { Dayjs } from 'dayjs';

export const formatNumberDecimal = (data: number) => {
  return Number(data.toFixed(2));
};
export const dateToStringTh = (date: Date) => {
  const result = new Date(date).toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
  });
  return result;
};

export const dateToStringThDayjs = (date: Date | Dayjs | string) => {
  const result = dayjs(date).format('DD/MM/YYYY');
  return result;
};
export const dateToStringThTime = (date?: Date | Dayjs | string) => {
  const result = dayjs(date).format('HH:mm');
  return result;
};
export const utils = {
  formatNumberDecimal,
  dateToStringTh,
};

export function dateToStringThNoTime(date: Date) {
  const result = new Date(date).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Bangkok',
  });
  return result;
}
