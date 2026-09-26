using UnityEngine;

/// <summary>
/// 掛在 Player 底下的 Spot Light GameObject 上。
/// 按 F 切換開關，電量會隨時間消耗，沒電就自動關閉。
/// 視野受限是恐怖遊戲的核心張力來源之一：黑暗中看不清楚，玩家會緊張。
/// </summary>
[RequireComponent(typeof(Light))]
public class Flashlight : MonoBehaviour
{
    [SerializeField] private KeyCode toggleKey = KeyCode.F;
    [SerializeField] private float maxBattery = 100f;
    [SerializeField] private float drainPerSecond = 2f;

    private Light spotLight;
    private float battery;
    private bool isOn;

    public float BatteryPercent => battery / maxBattery;

    private void Awake()
    {
        spotLight = GetComponent<Light>();
        battery = maxBattery;
        SetOn(false);
    }

    private void Update()
    {
        if (Input.GetKeyDown(toggleKey) && battery > 0f)
        {
            SetOn(!isOn);
        }

        if (isOn)
        {
            battery = Mathf.Max(0f, battery - drainPerSecond * Time.deltaTime);
            if (battery <= 0f)
            {
                SetOn(false);
            }
        }
    }

    private void SetOn(bool value)
    {
        isOn = value;
        spotLight.enabled = value;
    }
}
