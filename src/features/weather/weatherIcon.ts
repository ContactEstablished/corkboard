import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { WeatherCondition } from '@/models'

export const WEATHER_ICONS: Record<WeatherCondition, Component> = {
  'clear': Sun,
  'partly-cloudy': CloudSun,
  'cloudy': Cloud,
  'rain': CloudRain,
  'storm': CloudLightning,
  'snow': CloudSnow,
  'fog': CloudFog,
}
