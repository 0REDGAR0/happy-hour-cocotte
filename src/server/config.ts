export const config = {
  appPort: Number(process.env.APP_PORT ?? 3000),
  happyHourDurationSeconds: Number(process.env.HAPPY_HOUR_DURATION_SECONDS ?? 600),
};
