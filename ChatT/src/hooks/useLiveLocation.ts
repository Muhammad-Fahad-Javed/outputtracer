"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase-browser";

export interface LiveLocationData {
  lat: number;
  lng: number;
  timestamp: number;
}

export function useLiveLocation(conversationId: string | null, userId: string | null) {
  const supabase = createClient();
  const [isSharing, setIsSharing] = useState(false);
  const [partnerLocation, setPartnerLocation] = useState<LiveLocationData | null>(null);
  
  const watchIdRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initialize the channel for listening to partner's location updates
  useEffect(() => {
    if (!conversationId || !userId) return;

    const channel = supabase.channel(`live-location:${conversationId}`, {
      config: {
        broadcast: { ack: false },
      },
    });

    channel
      .on("broadcast", { event: "location-update" }, (payload) => {
        // If the sender is not the current user, it's the partner
        if (payload.payload.userId !== userId) {
          setPartnerLocation({
            lat: payload.payload.lat,
            lng: payload.payload.lng,
            timestamp: payload.payload.timestamp,
          });
        }
      })
      .on("broadcast", { event: "location-stop" }, (payload) => {
        if (payload.payload.userId !== userId) {
          setPartnerLocation(null);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [conversationId, userId, supabase]);

  const toggleLiveLocation = useCallback(() => {
    if (!conversationId || !userId || !channelRef.current) return;

    if (isSharing) {
      // Stop sharing
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsSharing(false);
      channelRef.current.send({
        type: "broadcast",
        event: "location-stop",
        payload: { userId },
      });
    } else {
      // Start sharing
      if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        return;
      }

      setIsSharing(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          channelRef.current?.send({
            type: "broadcast",
            event: "location-update",
            payload: {
              userId,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              timestamp: Date.now(),
            },
          });
        },
        (error) => {
          console.error("Live location error:", error);
          setIsSharing(false);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    }
  }, [isSharing, conversationId, userId]);

  return {
    isSharing,
    partnerLocation,
    toggleLiveLocation,
  };
}
