package com.happyfamily.todayweather;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/** 오늘날씨 위젯(크기에 따라 1×1 ~ 4×4 배치) */
public class WeatherWidget extends AppWidgetProvider {
    protected boolean compare() { return false; }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) WidgetUpdater.render(c, m, id, compare());
        WidgetUpdater.schedule(c, false);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle opt) {
        WidgetUpdater.render(c, m, id, compare());
    }

    @Override
    public void onEnabled(Context c) { WidgetUpdater.schedule(c, true); }

    @Override
    public void onReceive(Context c, Intent i) {
        super.onReceive(c, i);
        if (WidgetUpdater.ACTION_REFRESH.equals(i.getAction())) WidgetUpdater.schedule(c, true);
    }
}
