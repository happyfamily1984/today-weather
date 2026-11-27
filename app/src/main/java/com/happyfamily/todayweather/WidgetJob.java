package com.happyfamily.todayweather;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** 위젯 예보를 백그라운드에서 받아오는 작업 */
public class WidgetJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            WidgetUpdater.refreshNow(getApplicationContext());
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }
}
